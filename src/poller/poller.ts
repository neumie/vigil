import { randomUUID } from 'node:crypto'
import type { VigilConfig } from '../config.js'
import type { DB } from '../db/client.js'
import type { GraphQLClient } from '../graphql/client.js'
import { LIST_NEW_TASKS } from '../graphql/queries.js'
import type { ContemberTask } from '../types.js'
import { log } from '../util/logger.js'

interface ListNewTasksResponse {
	listTask: ContemberTask[]
}

export class Poller {
	private timer: ReturnType<typeof setTimeout> | null = null
	private running = false

	constructor(
		private config: VigilConfig,
		private db: DB,
		private graphql: GraphQLClient,
		private onNewTask: (taskId: string) => void,
	) {}

	start() {
		if (this.running) return
		this.running = true
		log.info('poller', `Starting poller (interval: ${this.config.polling.intervalSeconds}s)`)
		this.tick()
	}

	stop() {
		this.running = false
		if (this.timer) {
			clearTimeout(this.timer)
			this.timer = null
		}
		log.info('poller', 'Poller stopped')
	}

	async pollOnce() {
		for (const project of this.config.projects) {
			try {
				await this.pollProject(project.slug)
			} catch (err) {
				log.error('poller', `Error polling project ${project.slug}`, err)
			}
		}
	}

	private async tick() {
		if (!this.running) return
		await this.pollOnce()
		if (this.running) {
			this.timer = setTimeout(() => this.tick(), this.config.polling.intervalSeconds * 1000)
		}
	}

	private async pollProject(projectSlug: string) {
		const state = this.db.getPollState(projectSlug)
		const createdAfter = state?.lastTaskSeen ?? '1970-01-01T00:00:00.000Z'

		const data = await this.graphql.query<ListNewTasksResponse>(LIST_NEW_TASKS, {
			projectSlug,
			createdAfter,
		})

		const tasks = data.listTask
		if (tasks.length === 0) return

		let newCount = 0
		let latestCreatedAt = createdAfter

		for (const task of tasks) {
			if (this.db.taskExistsByClientcareId(task.id)) continue

			const id = randomUUID()
			this.db.insertTask({
				id,
				clientcareId: task.id,
				projectSlug,
				title: task.title,
			})
			this.db.insertEvent(id, 'task_discovered', {
				clientcareId: task.id,
				title: task.title,
				status: task.status,
				priority: task.priority,
			})
			this.onNewTask(id)
			newCount++

			if (task.createdAt > latestCreatedAt) {
				latestCreatedAt = task.createdAt
			}
		}

		this.db.updatePollState(projectSlug, new Date().toISOString(), latestCreatedAt)

		if (newCount > 0) {
			log.success('poller', `Discovered ${newCount} new task(s) in ${projectSlug}`)
		}
	}
}
