import { closeSync, fstatSync, openSync, readSync } from 'node:fs'
import { resolve } from 'node:path'
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

	// Retry a failed/cancelled task
	api.post('/tasks/:id/retry', c => {
		const task = db.getTask(c.req.param('id'))
		if (!task) return c.json({ error: 'Not found' }, 404)
		if (task.status !== 'failed' && task.status !== 'cancelled') return c.json({ error: 'Task is not failed or cancelled' }, 400)
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

	// Cancel a running/queued task
	api.post('/tasks/:id/cancel', c => {
		const task = db.getTask(c.req.param('id'))
		if (!task) return c.json({ error: 'Not found' }, 404)
		if (task.status !== 'processing' && task.status !== 'queued') {
			return c.json({ error: 'Task is not active' }, 400)
		}
		const cancelled = queue.cancel(task.id)
		if (!cancelled && task.status === 'queued') {
			db.updateTask(task.id, {
				status: 'cancelled',
				errorMessage: 'Cancelled by user',
				completedAt: new Date().toISOString(),
			})
			db.insertEvent(task.id, 'task_cancelled')
		}
		return c.json({ data: { message: 'Cancellation requested' } })
	})

	// Update task status manually
	api.post('/tasks/:id/status', async c => {
		const task = db.getTask(c.req.param('id'))
		if (!task) return c.json({ error: 'Not found' }, 404)
		const body = await c.req.json<{ status: string }>()
		const validStatuses = ['completed', 'failed', 'cancelled', 'skipped']
		if (!validStatuses.includes(body.status)) {
			return c.json({ error: `Invalid status. Must be one of: ${validStatuses.join(', ')}` }, 400)
		}
		db.updateTask(task.id, {
			status: body.status,
			completedAt: new Date().toISOString(),
		})
		db.insertEvent(task.id, 'status_changed', { status: body.status, manual: true })
		return c.json({ data: { message: `Status set to ${body.status}` } })
	})

	// Stream task output (incremental via offset)
	api.get('/tasks/:id/output', c => {
		const task = db.getTask(c.req.param('id'))
		if (!task) return c.json({ error: 'Not found' }, 404)

		const logPath = resolve(process.cwd(), 'logs', `${c.req.param('id')}.log`)
		const offset = Number(c.req.query('offset') ?? 0)

		try {
			const fd = openSync(logPath, 'r')
			const stat = fstatSync(fd)
			const size = stat.size

			if (offset >= size) {
				closeSync(fd)
				return c.json({ data: { content: '', offset: size, done: task.status !== 'processing' } })
			}

			const buf = Buffer.alloc(size - offset)
			readSync(fd, buf, 0, buf.length, offset)
			closeSync(fd)

			return c.json({
				data: { content: buf.toString('utf-8'), offset: size, done: task.status !== 'processing' },
			})
		} catch {
			return c.json({ data: { content: '', offset: 0, done: task.status !== 'processing' } })
		}
	})

	// Force poll
	api.post('/poll/trigger', async c => {
		await poller.pollOnce()
		return c.json({ data: { message: 'Poll triggered' } })
	})

	return api
}
