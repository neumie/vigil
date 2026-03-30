import type { VigilConfig } from '../config.js'
import type { DB } from '../db/client.js'
import type { TaskProvider } from '../providers/provider.js'
import type { Solver } from '../solver/solver.js'
import type { QueueStatus } from '../types.js'
import { log } from '../util/logger.js'
import { processTask } from './worker.js'

export class TaskQueue {
	private pending: string[] = []
	private active = new Map<string, { title: string; startedAt: string }>()
	private running = false

	constructor(
		private config: VigilConfig,
		private db: DB,
		private provider: TaskProvider,
		private solver: Solver,
	) {}

	start() {
		this.running = true
		log.info('queue', `Queue started (concurrency: ${this.config.solver.concurrency})`)
		this.processNext()
	}

	stop() {
		this.running = false
		log.info('queue', 'Queue stopped')
	}

	enqueue(taskId: string) {
		if (!this.pending.includes(taskId) && !this.active.has(taskId)) {
			this.pending.push(taskId)
			safeInsertEvent(this.db, taskId, 'task_queued')
			log.info('queue', `Enqueued task ${taskId} (pending: ${this.pending.length})`)
			if (this.running) this.processNext()
		}
	}

	getStatus(): QueueStatus {
		return {
			pending: this.pending.length,
			active: this.active.size,
			maxConcurrency: this.config.solver.concurrency,
			activeTasks: Array.from(this.active.entries()).map(([taskId, info]) => ({
				taskId,
				...info,
			})),
		}
	}

	private processNext() {
		if (!this.running) return
		while (this.active.size < this.config.solver.concurrency && this.pending.length > 0) {
			const taskId = this.pending.shift()
			if (!taskId) break
			const task = this.db.getTask(taskId)
			const title = task?.title ?? taskId

			this.active.set(taskId, { title, startedAt: new Date().toISOString() })

			processTask(taskId, this.config, this.db, this.provider, this.solver).finally(() => {
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
