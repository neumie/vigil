import { Hono } from 'hono'
import { cors } from 'hono/cors'
import type { VigilConfig } from '../config.js'
import type { DB } from '../db/client.js'
import type { Poller } from '../poller/poller.js'
import type { TaskQueue } from '../queue/queue.js'
import { apiRoutes } from './routes/api.js'

export function createApp(config: VigilConfig, db: DB, queue: TaskQueue, poller: Poller) {
	const app = new Hono()

	app.use('*', cors())

	app.route('/api', apiRoutes(config, db, queue, poller))

	return app
}
