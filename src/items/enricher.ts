import type { HelmConfig } from '../config.js'
import type { TaskContext, TaskProvider } from '../providers/provider.js'
import type { OneShotOptions } from '../solver/one-shot.js'
import { log } from '../util/logger.js'
import { ensureItemAssessment, itemWantsAssessment } from './assess.js'
import { ItemCommands } from './commands.js'
import { buildItemTaskContext } from './context.js'
import {
	ensureItemDisplayName,
	ensureItemWorkspaceName,
	itemWantsDisplayName,
	itemWantsWorkspaceName,
} from './naming.js'
import type { ItemRecord } from './schema.js'
import type { ItemStore } from './store.js'

export interface EnricherDeps {
	runOneShot?: (opts: OneShotOptions) => Promise<string | null>
	branchExists?: (branch: string) => boolean | Promise<boolean>
	now?: () => string
}

export interface EnricherOptions {
	/** Injected for tests (stub model + tiny delays); production uses the defaults. */
	deps?: EnricherDeps
	/** Backoff schedule for transient-failure retries; one entry per retry. */
	retryDelaysMs?: number[]
}

// One initial run + up to (retryDelays.length) retries on transient failure.
const DEFAULT_RETRY_DELAYS_MS = [30_000, 120_000, 300_000]

/**
 * Background per-item AI enricher. For each source Item—or source-less solve Item
 * still waiting in Queue—it runs the best-effort enrichments that are enabled and
 * missing: a short display name (from the title), a pre-solve intent assessment,
 * and an optional AI branch name (both from task context). Work stays off the
 * poll/start hot paths, with a small concurrency cap so a batch cannot fan out
 * dozens of model calls at once. Wired in `index.ts`; poll/API creation enqueues
 * new Items, and startup runs a one-time backfill over eligible rows.
 *
 * **Transient-failure auto-retry.** A one-shot model call can time out (SIGTERM)
 * when the machine is overloaded, leaving the Item unenriched. After each run, if
 * the Item still *wants* enrichment (a long title with no display name, an
 * unassessed Item, or a runnable worktree Item with no branch identity — short
 * titles, Main runs, and disabled features don't count), the enricher re-enqueues
 * it on a backoff, up to a small cap, so a transient timeout recovers
 * on its own instead of waiting for the next daemon restart. The cap bounds a
 * genuinely-stuck case (e.g. persistently unparseable model output). Mirrors the
 * Drainer's transient solve retry.
 */
export class ItemEnricher {
	private readonly commands: ItemCommands
	private readonly queue: string[] = []
	private readonly pending = new Set<string>()
	private readonly attempts = new Map<string, number>()
	private readonly retryTimers = new Set<ReturnType<typeof setTimeout>>()
	private readonly deps?: EnricherDeps
	private readonly retryDelaysMs: number[]
	private active = 0
	private stopped = false

	constructor(
		private readonly config: HelmConfig,
		private readonly store: ItemStore,
		private readonly provider: TaskProvider,
		private readonly concurrency = 3,
		options: EnricherOptions = {},
	) {
		this.commands = new ItemCommands(store, config)
		this.deps = options.deps
		this.retryDelaysMs = options.retryDelaysMs ?? DEFAULT_RETRY_DELAYS_MS
	}

	private get enabled(): boolean {
		return (
			this.config.solver.displayName.enabled ||
			this.config.solver.triage.enabled ||
			this.config.solver.branchNaming.enabled
		)
	}

	/** An enrichment that should have landed but hasn't (worth running / retrying).
	 * Source Items keep their historical cosmetic backfill behavior; source-less
	 * manual Items are eligible only while waiting in Queue. */
	private needsEnrichment(item: ItemRecord): boolean {
		if (item.kind !== 'solve') return false
		if (!item.source && item.status !== 'ready') return false
		return (
			itemWantsDisplayName(item, this.config) ||
			itemWantsAssessment(item, this.config) ||
			itemWantsWorkspaceName(item, this.config)
		)
	}

	/** One-time startup sweep over Items still missing eligible enrichment. */
	backfill() {
		if (!this.enabled) return
		const pending = this.store.listItemsNeedingEnrichment()
		if (pending.length > 0) log.info('enrich', `Backfilling enrichment for ${pending.length} Item(s)`)
		this.enqueue(pending)
	}

	enqueue(items: ItemRecord[]) {
		if (this.stopped || !this.enabled) return
		for (const item of items) {
			if (!this.needsEnrichment(item)) continue
			if (this.pending.has(item.id)) continue
			this.pending.add(item.id)
			this.queue.push(item.id)
		}
		this.pump()
	}

	stop() {
		this.stopped = true
		this.queue.length = 0
		this.pending.clear()
		this.attempts.clear()
		for (const timer of this.retryTimers) clearTimeout(timer)
		this.retryTimers.clear()
	}

	private pump() {
		while (!this.stopped && this.active < this.concurrency && this.queue.length > 0) {
			const id = this.queue.shift()
			if (!id) break
			this.active++
			void this.enrichOne(id).finally(() => {
				this.active--
				this.pending.delete(id)
				if (!this.stopped) {
					this.maybeScheduleRetry(id)
					this.pump()
				}
			})
		}
	}

	/** Re-enqueue on a backoff if the Item still wants enrichment and attempts remain. */
	private maybeScheduleRetry(id: string) {
		const item = this.store.get(id)
		if (!item || !this.needsEnrichment(item)) {
			this.attempts.delete(id)
			return
		}
		const attempt = this.attempts.get(id) ?? 1
		if (attempt > this.retryDelaysMs.length) {
			log.warn('enrich', `Giving up enrichment for Item ${id} after ${attempt} attempt(s)`)
			this.attempts.delete(id)
			return
		}
		const delay = this.retryDelaysMs[attempt - 1]
		this.attempts.set(id, attempt + 1)
		const timer = setTimeout(() => {
			this.retryTimers.delete(timer)
			if (this.stopped) return
			const fresh = this.store.get(id)
			if (fresh && this.needsEnrichment(fresh)) this.enqueue([fresh])
			else this.attempts.delete(id)
		}, delay)
		if (typeof timer.unref === 'function') timer.unref()
		this.retryTimers.add(timer)
		log.info('enrich', `Retrying enrichment for Item ${id} in ${Math.round(delay / 1000)}s (attempt ${attempt + 1})`)
	}

	private async enrichOne(id: string) {
		let item = this.store.get(id)
		if (!item) return
		// Display name first (title-only); it returns the updated row so later
		// context-based passes start from the freshest Item without a reload.
		item = await ensureItemDisplayName({
			commands: this.commands,
			item,
			config: this.config,
			deps: this.deps,
		}).catch(err => {
			log.warn('enrich', `Display naming error for Item ${id}: ${err instanceof Error ? err.message : err}`)
			return item as ItemRecord
		})

		const wantsAssessment = itemWantsAssessment(item, this.config)
		const wantsWorkspaceName = itemWantsWorkspaceName(item, this.config)
		if (wantsAssessment || wantsWorkspaceName) {
			const taskContext = buildItemTaskContext(item, await this.fetchContext(item))
			// Identity is latency-critical: reserve the branch before advisory triage
			// so a newly hand-added Item can be started with its AI name immediately.
			const freshItem = this.store.get(id)
			if (!freshItem) return
			item = freshItem
			const projectConfig = this.config.projects.find(project => project.slug === freshItem.projectSlug)
			if (projectConfig && itemWantsWorkspaceName(freshItem, this.config)) {
				await ensureItemWorkspaceName({
					commands: this.commands,
					item: freshItem,
					taskContext,
					config: this.config,
					repoPath: projectConfig.repoPath,
					agent:
						freshItem.payload.kind === 'solve'
							? (freshItem.payload.solverAgent ?? this.config.solver.agent)
							: this.config.solver.agent,
					deps: this.deps,
					preRunOnly: true,
				}).catch(err => {
					log.warn('enrich', `Branch naming error for Item ${id}: ${err instanceof Error ? err.message : err}`)
				})
			}

			if (wantsAssessment) {
				await ensureItemAssessment({
					commands: this.commands,
					item,
					taskContext,
					config: this.config,
					deps: this.deps,
				}).catch(err => {
					log.warn('enrich', `Assessment error for Item ${id}: ${err instanceof Error ? err.message : err}`)
				})
			}
		}
	}

	/** Task context for assessment/naming: frozen captured context first (ingested
	 *  email etc.), else live provider context; degrades to canonical title plus
	 *  the hand-authored prompt for manual solve Items. */
	private async fetchContext(item: ItemRecord): Promise<TaskContext> {
		const fallback: TaskContext = {
			title: item.title,
			...(item.payload.kind === 'solve' ? { description: item.payload.prompt } : {}),
		}
		if (item.capturedContext) return item.capturedContext
		if (!item.source) return fallback
		try {
			const ctx = await this.provider.getTaskContext(item.source.externalId)
			return ctx ?? fallback
		} catch (err) {
			log.warn('enrich', `getTaskContext failed for Item ${item.id}: ${err instanceof Error ? err.message : err}`)
			return fallback
		}
	}
}
