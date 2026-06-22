import type { VigilConfig } from '../config.js'
import type { DB } from '../db/client.js'
import { ItemCommands } from '../items/commands.js'
import type { ItemRecord } from '../items/schema.js'
import type { TaskProvider } from '../providers/provider.js'
import type { Solver } from '../solver/solver.js'
import type { QueueStatus } from '../types.js'
import { log } from '../util/logger.js'
import { AlmanacLoopRunner } from './loop-runner.js'
import type { LoopRunner } from './loop-runner.js'
import { processLoopItem, processSolveItem, processTask } from './worker.js'

type ActiveRun = { title: string; startedAt: string; controller: AbortController }

function isStartableItem(item: ItemRecord): boolean {
	return item.status === 'queued' || item.status === 'planned'
}

export class Drainer {
	private pendingTasks: string[] = []
	private activeTasks = new Map<string, ActiveRun>()
	private activeSolveItems = new Map<string, ActiveRun>()
	private activeLoopItems = new Map<string, ActiveRun>()
	private running = false
	private paused = true
	private recoveredStaleItems = false
	private readonly itemCommands: ItemCommands

	constructor(
		private config: VigilConfig,
		private db: DB,
		private provider: TaskProvider,
		private solver: Solver,
		private loopRunner: LoopRunner = new AlmanacLoopRunner(),
	) {
		this.itemCommands = new ItemCommands(db.items, config)
	}

	start() {
		const recovered = this.recoverStaleProcessingItemsOnce()
		this.running = true
		log.info(
			'drainer',
			`Drainer started (solve lane: ${this.solveCapacity()}, loop lane: ${this.loopCapacity()}, paused: ${this.paused})`,
		)
		if (recovered > 0) log.warn('drainer', `Recovered ${recovered} stale processing Item(s)`)
		if (!this.paused) this.processNext()
	}

	stop() {
		this.running = false
		log.info('drainer', 'Drainer stopped')
	}

	pause() {
		this.paused = true
		log.info('drainer', 'Drainer paused - queued work will not start')
	}

	resume() {
		this.paused = false
		log.info('drainer', 'Drainer resumed')
		this.processNext()
	}

	wake() {
		if (this.running && !this.paused) this.processNext()
	}

	isPaused(): boolean {
		return this.paused
	}

	enqueue(taskId: string, silent = false) {
		if (!this.pendingTasks.includes(taskId) && !this.activeTasks.has(taskId)) {
			this.pendingTasks.push(taskId)
			if (!silent) safeInsertEvent(this.db, taskId, 'task_queued')
			log.info('drainer', `Enqueued legacy task ${taskId} (pending: ${this.pendingTasks.length})`)
			this.wake()
		}
	}

	/** Process a single legacy task immediately, bypassing pause state. */
	processOne(taskId: string): boolean {
		const idx = this.pendingTasks.indexOf(taskId)
		if (idx !== -1) this.pendingTasks.splice(idx, 1)
		if (this.activeTasks.has(taskId)) return false

		const task = this.db.getTask(taskId)
		if (!task) return false

		const controller = new AbortController()
		this.activeTasks.set(taskId, { title: task.title, startedAt: new Date().toISOString(), controller })

		processTask(taskId, this.config, this.db, this.provider, this.solver, controller.signal).finally(() => {
			this.activeTasks.delete(taskId)
			this.wake()
		})

		return true
	}

	/** Process a single Item immediately, bypassing pause state. */
	processOneItem(itemId: string): boolean {
		const item = this.db.items.get(itemId)
		if (!item) return false
		if (item.kind === 'solve') return this.startSolveItem(itemId)
		if (item.kind === 'ralph' || item.kind === 'harden') return this.startLoopItem(itemId)
		return false
	}

	retryItem(itemId: string): ItemRecord {
		const item = this.itemCommands.retryItem(itemId)
		this.wake()
		return item
	}

	cancelItem(itemId: string): boolean {
		const active = this.activeSolveItems.get(itemId)
		if (active) {
			active.controller.abort()
			return true
		}
		const activeLoop = this.activeLoopItems.get(itemId)
		if (activeLoop) {
			activeLoop.controller.abort()
			return true
		}
		this.itemCommands.cancelQueuedItem(itemId)
		return true
	}

	cancel(taskId: string): boolean {
		const entry = this.activeTasks.get(taskId)
		if (entry) {
			entry.controller.abort()
			return true
		}
		const idx = this.pendingTasks.indexOf(taskId)
		if (idx !== -1) {
			this.pendingTasks.splice(idx, 1)
			return true
		}
		return false
	}

	getStatus(): QueueStatus {
		const solvePending = this.itemCommands.countQueuedItems('solve') + this.pendingTasks.length
		const loopPending = this.itemCommands.countQueuedItems('ralph') + this.itemCommands.countQueuedItems('harden')
		const activeSolve = this.activeSolveCount()
		const activeLoop = this.activeLoopCount()
		return {
			paused: this.paused,
			pending: solvePending + loopPending,
			active: activeSolve + activeLoop,
			maxConcurrency: this.solveCapacity() + this.loopCapacity(),
			activeTasks: [
				...Array.from(this.activeTasks.entries()).map(([taskId, info]) => ({
					taskId,
					title: info.title,
					startedAt: info.startedAt,
				})),
				...Array.from(this.activeSolveItems.entries()).map(([taskId, info]) => ({
					taskId,
					title: info.title,
					startedAt: info.startedAt,
				})),
				...Array.from(this.activeLoopItems.entries()).map(([taskId, info]) => ({
					taskId,
					title: info.title,
					startedAt: info.startedAt,
				})),
			],
			lanes: {
				solve: {
					pending: solvePending,
					active: activeSolve,
					maxConcurrency: this.solveCapacity(),
				},
				loop: {
					pending: loopPending,
					active: activeLoop,
					maxConcurrency: this.loopCapacity(),
				},
			},
		}
	}

	private processNext() {
		if (!this.running || this.paused) return

		while (this.activeSolveCount() < this.solveCapacity()) {
			const item = this.nextQueuedSolveItem()
			if (item) {
				if (!this.startSolveItem(item.id)) break
				continue
			}

			const taskId = this.pendingTasks.shift()
			if (!taskId) break
			if (!this.processOne(taskId)) continue
		}

		while (this.activeLoopCount() < this.loopCapacity()) {
			const item = this.nextQueuedLoopItem()
			if (!item) break
			if (!this.startLoopItem(item.id)) break
		}
	}

	private recoverStaleProcessingItemsOnce(): number {
		if (this.recoveredStaleItems) return 0
		this.recoveredStaleItems = true
		return this.itemCommands.recoverStaleProcessingItems().length
	}

	private startSolveItem(itemId: string): boolean {
		if (this.activeSolveItems.has(itemId)) return false
		const item = this.db.items.get(itemId)
		if (!item || item.kind !== 'solve') return false
		if (!isStartableItem(item)) return false

		const controller = new AbortController()
		this.activeSolveItems.set(itemId, { title: item.title, startedAt: new Date().toISOString(), controller })

		processSolveItem(itemId, this.config, this.db, this.provider, this.solver, controller.signal).finally(() => {
			this.activeSolveItems.delete(itemId)
			this.wake()
		})

		return true
	}

	private startLoopItem(itemId: string): boolean {
		if (this.activeLoopItems.has(itemId)) return false
		const item = this.db.items.get(itemId)
		if (!item || (item.kind !== 'ralph' && item.kind !== 'harden')) return false
		if (!isStartableItem(item)) return false

		const controller = new AbortController()
		this.activeLoopItems.set(itemId, { title: item.title, startedAt: new Date().toISOString(), controller })

		processLoopItem(itemId, this.config, this.db, this.loopRunner, controller.signal).finally(() => {
			this.activeLoopItems.delete(itemId)
			this.wake()
		})

		return true
	}

	private nextQueuedSolveItem(): ItemRecord | null {
		const activeIds = new Set(this.activeSolveItems.keys())
		return (
			this.itemCommands.nextQueuedItems('solve', this.solveCapacity() + activeIds.size + 5).find(item => {
				return !activeIds.has(item.id)
			}) ?? null
		)
	}

	private nextQueuedLoopItem(): ItemRecord | null {
		const activeIds = new Set(this.activeLoopItems.keys())
		const limit = this.loopCapacity() + activeIds.size + 5
		const candidates = [
			...this.itemCommands.nextQueuedItems('ralph', limit),
			...this.itemCommands.nextQueuedItems('harden', limit),
		].filter(item => !activeIds.has(item.id))
		candidates.sort((a, b) => {
			const queued = (a.queuedAt ?? a.createdAt).localeCompare(b.queuedAt ?? b.createdAt)
			if (queued !== 0) return queued
			return a.createdAt.localeCompare(b.createdAt)
		})
		return candidates[0] ?? null
	}

	private activeSolveCount(): number {
		return this.activeTasks.size + this.activeSolveItems.size
	}

	private activeLoopCount(): number {
		return this.activeLoopItems.size
	}

	private solveCapacity(): number {
		return this.config.solver.concurrency
	}

	private loopCapacity(): number {
		return 1
	}
}

function safeInsertEvent(db: DB, taskId: string, eventType: string) {
	try {
		db.insertEvent(taskId, eventType)
	} catch {
		// Non-critical.
	}
}
