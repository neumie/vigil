import type { VigilConfig } from '../config.js'
import type { DB } from '../db/client.js'
import type { TaskProvider } from '../providers/provider.js'
import type { Solver } from '../solver/solver.js'
import type { QueueStatus } from '../types.js'
import { log } from '../util/logger.js'
import { processTask } from './worker.js'

export class TaskQueue {
	private pending: string[] = []
	private active = new Map<string, { title: string; startedAt: string; controller: AbortController }>()
	private running = false
	private paused = true

	constructor(
		private config: VigilConfig,
		private db: DB,
		private provider: TaskProvider,
		private solver: Solver,
	) {}

	start() {
		this.running = true
		log.info('queue', `Queue started (concurrency: ${this.config.solver.concurrency}, paused: ${this.paused})`)
		if (!this.paused) this.processNext()
	}

	stop() {
		this.running = false
		log.info('queue', 'Queue stopped')
	}

	pause() {
		this.paused = true
		log.info('queue', 'Queue paused — tasks will be queued but not processed')
	}

	resume() {
		this.paused = false
		log.info('queue', 'Queue resumed')
		this.processNext()
	}

	isPaused(): boolean {
		return this.paused
	}

	enqueue(taskId: string, silent = false) {
		if (!this.pending.includes(taskId) && !this.active.has(taskId)) {
			this.pending.push(taskId)
			if (!silent) safeInsertEvent(this.db, taskId, 'task_queued')
			log.info('queue', `Enqueued task ${taskId} (pending: ${this.pending.length})`)
			if (this.running && !this.paused) this.processNext()
		}
	}

	/** Process a single task immediately, bypassing pause state. */
	processOne(taskId: string): boolean {
		// Remove from pending if it's there
		const idx = this.pending.indexOf(taskId)
		if (idx !== -1) this.pending.splice(idx, 1)

		if (this.active.has(taskId)) return false // already running

		const task = this.db.getTask(taskId)
		if (!task) return false

		const controller = new AbortController()
		this.active.set(taskId, { title: task.title, startedAt: new Date().toISOString(), controller })

		processTask(taskId, this.config, this.db, this.provider, this.solver, controller.signal).finally(() => {
			this.active.delete(taskId)
			if (!this.paused) this.processNext()
		})

		return true
	}

	cancel(taskId: string): boolean {
		// Cancel active task
		const entry = this.active.get(taskId)
		if (entry) {
			entry.controller.abort()
			return true
		}
		// Remove from pending queue
		const idx = this.pending.indexOf(taskId)
		if (idx !== -1) {
			this.pending.splice(idx, 1)
			return true
		}
		return false
	}

	getStatus(): QueueStatus {
		return {
			paused: this.paused,
			pending: this.pending.length,
			active: this.active.size,
			maxConcurrency: this.config.solver.concurrency,
			activeTasks: Array.from(this.active.entries()).map(([taskId, info]) => ({
				taskId,
				title: info.title,
				startedAt: info.startedAt,
			})),
		}
	}

	private processNext() {
		if (!this.running || this.paused) return
		while (this.active.size < this.config.solver.concurrency && this.pending.length > 0) {
			const taskId = this.pending.shift()
			if (!taskId) break
			const task = this.db.getTask(taskId)
			const title = task?.title ?? taskId

			const controller = new AbortController()
			this.active.set(taskId, { title, startedAt: new Date().toISOString(), controller })

			processTask(taskId, this.config, this.db, this.provider, this.solver, controller.signal).finally(() => {
				this.active.delete(taskId)
				this.processNext()
			})
		}
	}
}

function safeInsertEvent(db: DB, taskId: string, eventType: string) {
	try {
		db.insertEvent(taskId, eventType)
	} catch {
		// Non-critical
	}
}
