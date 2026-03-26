#!/usr/bin/env node

import { execSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { STDERR_LOG, STDOUT_LOG, getPid, isLoaded, load, unload } from './launchd.js'

const HELP = `Usage: vigil <command>

Commands:
  start    Start the Vigil daemon
  stop     Stop the Vigil daemon
  status   Show daemon status
  logs     Tail daemon logs (--err for stderr)
  help     Show this help message`

function start(): void {
	try {
		load()
		console.log('Vigil daemon started.')
		console.log(`Logs: ${STDOUT_LOG}`)
	} catch (err) {
		console.error(`Error: ${err instanceof Error ? err.message : err}`)
		process.exit(1)
	}
}

function stop(): void {
	try {
		unload()
		console.log('Vigil daemon stopped.')
	} catch (err) {
		console.error(`Error: ${err instanceof Error ? err.message : err}`)
		process.exit(1)
	}
}

function status(): void {
	if (!isLoaded()) {
		console.log('Vigil is not running.')
		process.exit(1)
	}
	const pid = getPid()
	console.log(`Vigil is running.${pid ? ` (PID: ${pid})` : ''}`)
}

function logs(): void {
	const useStderr = process.argv.includes('--err')
	const logFile = useStderr ? STDERR_LOG : STDOUT_LOG

	if (!existsSync(logFile)) {
		console.error(`Log file not found: ${logFile}`)
		console.error('Has Vigil been started at least once?')
		process.exit(1)
	}

	try {
		execSync(`tail -f "${logFile}"`, { stdio: 'inherit' })
	} catch {
		// User hit Ctrl+C to exit tail — expected
	}
}

const command = process.argv[2]

switch (command) {
	case 'start':
		start()
		break
	case 'stop':
		stop()
		break
	case 'status':
		status()
		break
	case 'logs':
		logs()
		break
	case 'help':
	case '--help':
	case '-h':
	case undefined:
		console.log(HELP)
		break
	default:
		console.error(`Unknown command: ${command}`)
		console.log(HELP)
		process.exit(1)
}
