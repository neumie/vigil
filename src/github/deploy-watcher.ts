import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import type { VigilConfig } from '../config.js'
import type { DB } from '../db/client.js'
import { ItemCommands } from '../items/commands.js'
import type { DeployState, DeploymentEntry } from '../items/schema.js'
import { log } from '../util/logger.js'

const execFileAsync = promisify(execFile)

/** owner/repo from a GitHub PR URL (the deploy lookups key off these). */
export function parsePrUrl(url: string): { owner: string; repo: string } | null {
	const m = url.match(/github\.com\/([^/]+)\/([^/]+)\/pull\/\d+/)
	return m ? { owner: m[1], repo: m[2] } : null
}

/**
 * Only http(s) deployment URLs are safe to render as a clickable link — a
 * deployment status's environment_url/target_url is set by whoever created the
 * deployment (an attacker-controlled workflow could inject a `javascript:` URI),
 * so anything else is dropped at the source before it's persisted.
 */
export function httpUrlOrNull(url: string | null | undefined): string | null {
	if (!url) return null
	try {
		const parsed = new URL(url)
		return parsed.protocol === 'https:' || parsed.protocol === 'http:' ? url : null
	} catch {
		return null
	}
}

/** Run `gh` and JSON-parse stdout. Best-effort: any failure (gh missing, auth,
 *  network, non-JSON) returns null so the watcher degrades to a no-op. */
async function ghJson<T = unknown>(args: string[]): Promise<T | null> {
	try {
		const { stdout } = await execFileAsync('gh', args, { timeout: 10_000, maxBuffer: 4 * 1024 * 1024 })
		return JSON.parse(stdout) as T
	} catch {
		return null
	}
}

interface GhPrView {
	state?: string
	mergedAt?: string | null
	mergeCommit?: { oid?: string } | null
}
interface GhDeployment {
	id?: number
	environment?: string
	updated_at?: string
}
interface GhDeploymentStatus {
	state?: string
	environment_url?: string
	target_url?: string
	updated_at?: string
}

/**
 * Observe the post-ship lifecycle of a PR from GitHub: is it merged, and which
 * environments has its merge commit been deployed to (+ each deployment's latest
 * status). Returns null when the repo can't be derived or the PR can't be read.
 */
export async function fetchDeployState(prUrl: string, checkedAt: string): Promise<DeployState | null> {
	const repo = parsePrUrl(prUrl)
	if (!repo) return null
	const pr = await ghJson<GhPrView>(['pr', 'view', prUrl, '--json', 'state,mergedAt,mergeCommit'])
	if (!pr) return null

	const merged = pr.state === 'MERGED'
	const mergedAt = pr.mergedAt ?? null
	const mergeSha = pr.mergeCommit?.oid ?? null

	const deployments: DeploymentEntry[] = []
	if (merged && mergeSha) {
		const base = `repos/${repo.owner}/${repo.repo}`
		const deps = await ghJson<GhDeployment[]>(['api', `${base}/deployments?sha=${mergeSha}&per_page=100`])
		if (Array.isArray(deps)) {
			for (const d of deps) {
				if (d.id === undefined) continue
				const statuses = await ghJson<GhDeploymentStatus[]>(['api', `${base}/deployments/${d.id}/statuses?per_page=1`])
				const latest = Array.isArray(statuses) ? statuses[0] : null
				deployments.push({
					environment: String(d.environment ?? 'unknown'),
					state: latest?.state ? String(latest.state) : 'pending',
					url: httpUrlOrNull(latest?.environment_url) ?? httpUrlOrNull(latest?.target_url),
					updatedAt: latest?.updated_at ?? d.updated_at ?? null,
				})
			}
		}
	}

	return { merged, mergedAt, mergeSha, deployments, checkedAt }
}

/**
 * Periodically reconciles each shipped Item's deploy lifecycle from GitHub
 * (PR merge + GitHub Deployments per environment) and persists it through
 * `ItemCommands.recordDeployState`, which records `deploy_merged` /
 * `deploy_succeeded` transition events. Mirrors the provider `Poller`. Read-only
 * w.r.t. GitHub; runs independently of the Drainer (safe while paused).
 */
export class DeployWatcher {
	private timer: ReturnType<typeof setTimeout> | null = null
	private running = false
	private readonly commands: ItemCommands
	private readonly intervalSeconds: number

	constructor(
		private config: VigilConfig,
		private db: DB,
	) {
		this.commands = new ItemCommands(db.items, config)
		this.intervalSeconds = config.github.deployPollSeconds
	}

	start() {
		if (this.running) return
		if (!this.config.github.trackDeployments) {
			log.info('deploy', 'Deploy tracking disabled (github.trackDeployments=false)')
			return
		}
		this.running = true
		log.info('deploy', `Starting deploy watcher (interval: ${this.intervalSeconds}s)`)
		this.tick()
	}

	stop() {
		this.running = false
		if (this.timer) {
			clearTimeout(this.timer)
			this.timer = null
		}
		log.info('deploy', 'Deploy watcher stopped')
	}

	async pollOnce() {
		const items = this.db.items.listDeployWatchable()
		for (const item of items) {
			if (!item.prUrl) continue
			try {
				const state = await fetchDeployState(item.prUrl, new Date().toISOString())
				if (state) this.commands.recordDeployState(item.id, state)
			} catch (err) {
				log.error('deploy', `Error checking deploy state for Item ${item.id}`, err)
			}
		}
	}

	private async tick() {
		if (!this.running) return
		await this.pollOnce()
		if (this.running) {
			this.timer = setTimeout(() => this.tick(), this.intervalSeconds * 1000)
		}
	}
}
