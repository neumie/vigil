import { loadConfig } from './config.js'
import { DB } from './db/client.js'
import { Poller } from './poller/poller.js'
import { createProvider } from './providers/registry.js'
import { Drainer } from './queue/drainer.js'
import { createApp } from './server/app.js'
import { createSolver } from './solver/registry.js'
import { createSpawner } from './spawner/registry.js'
import { log } from './util/logger.js'

async function main() {
	process.title = 'vigil'
	log.info('vigil', 'Starting Vigil...')

	const { config, configPath } = loadConfig()
	log.info(
		'vigil',
		`Loaded config: ${config.projects.length} project(s), poll every ${config.polling.intervalSeconds}s`,
	)

	const db = new DB()
	const provider = createProvider(config.provider)
	log.info('vigil', `Provider: ${provider.name}`)

	const solver = await createSolver(config)
	log.info(
		'vigil',
		`Solver configured: ${config.solver.type}, agent: ${config.solver.agent}, active: ${solver.constructor.name}`,
	)
	const spawner = await createSpawner(config)
	log.info('vigil', `Spawner configured: ${config.spawner.name}, active: ${spawner.constructor.name}`)

	const queue = new Drainer(config, db, provider, solver)

	// Recover tasks that were processing when we last shut down
	const stale = db.getProcessingTaskIds()
	for (const id of stale) {
		log.warn('vigil', `Recovering stale processing task: ${id}`)
		db.updateTask(id, { status: 'queued' })
		queue.enqueue(id, true)
	}

	// Re-enqueue any queued tasks from DB
	const queued = db.getQueuedTaskIds()
	for (const id of queued) {
		queue.enqueue(id, true)
	}
	const queuedSolveItems = db.items.countQueuedByKind('solve')
	if (queued.length > 0) {
		log.info('vigil', `Re-enqueued ${queued.length} pending task(s) from DB`)
	}
	if (queuedSolveItems > 0) {
		log.info('vigil', `Found ${queuedSolveItems} queued solve Item(s)`)
	}

	const poller = new Poller(config, db, provider)

	// Start API server
	const app = createApp(config, configPath, db, queue, poller, provider, spawner)
	const { serve } = await import('@hono/node-server')
	serve({ fetch: app.fetch, port: config.server.port, hostname: config.server.host }, () => {
		log.success('vigil', `Dashboard: http://${config.server.host}:${config.server.port}`)
	})

	// Start polling
	poller.start()

	// Start processing queue
	queue.start()

	// Graceful shutdown
	const shutdown = () => {
		log.info('vigil', 'Shutting down...')
		poller.stop()
		queue.stop()
		db.close()
		process.exit(0)
	}
	process.on('SIGINT', shutdown)
	process.on('SIGTERM', shutdown)
}

main().catch(err => {
	log.error('vigil', 'Fatal error', err)
	process.exit(1)
})
