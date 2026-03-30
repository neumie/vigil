import { Hono } from 'hono'
import type { VigilConfig } from '../../config.js'
import type { DB } from '../../db/client.js'
import type { Poller } from '../../poller/poller.js'
import type { TaskQueue } from '../../queue/queue.js'

export function apiRoutes(config: VigilConfig, db: DB, queue: TaskQueue, poller: Poller) {
	const api = new Hono()

	// Daemon status
	api.get('/status', c => {
		const queueStatus = queue.getStatus()
		return c.json({
			data: {
				uptime: process.uptime(),
				queue: queueStatus,
				projects: config.projects.map(p => p.slug),
				pollInterval: config.polling.intervalSeconds,
			},
		})
	})

	// List tasks
	api.get('/tasks', c => {
		const status = c.req.query('status')
		const project = c.req.query('project')
		const limit = Number(c.req.query('limit') ?? 50)
		const offset = Number(c.req.query('offset') ?? 0)
		const tasks = db.listTasks({
			status: status || undefined,
			projectSlug: project || undefined,
			limit,
			offset,
		})
		return c.json({ data: tasks })
	})

	// Single task detail
	api.get('/tasks/:id', c => {
		const task = db.getTask(c.req.param('id'))
		if (!task) return c.json({ error: 'Not found' }, 404)
		return c.json({ data: task })
	})

	// Task events (activity timeline)
	api.get('/tasks/:id/events', c => {
		const events = db.getEvents(c.req.param('id'))
		return c.json({ data: events })
	})

	// Queue state
	api.get('/queue', c => {
		return c.json({ data: queue.getStatus() })
	})

	// Config (sanitized)
	api.get('/config', c => {
		return c.json({
			data: {
				projects: config.projects.map(p => ({
					slug: p.slug,
					repoPath: p.repoPath,
					baseBranch: p.baseBranch,
				})),
				polling: config.polling,
				solver: {
					concurrency: config.solver.concurrency,
					model: config.solver.model,
					timeoutMinutes: config.solver.timeoutMinutes,
				},
				taskBaseUrl: config.provider.type === 'contember' ? config.provider.taskBaseUrl : undefined,
			},
		})
	})

	// Stats
	api.get('/stats', c => {
		return c.json({ data: db.getStats() })
	})

	// Retry a failed task
	api.post('/tasks/:id/retry', c => {
		const task = db.getTask(c.req.param('id'))
		if (!task) return c.json({ error: 'Not found' }, 404)
		if (task.status !== 'failed') return c.json({ error: 'Task is not failed' }, 400)
		db.updateTask(task.id, {
			status: 'queued',
			errorMessage: null,
			errorPhase: null,
			startedAt: null,
			completedAt: null,
		})
		queue.enqueue(task.id)
		return c.json({ data: { message: 'Task re-enqueued' } })
	})

	// Force poll
	api.post('/poll/trigger', async c => {
		await poller.pollOnce()
		return c.json({ data: { message: 'Poll triggered' } })
	})

	return api
}
