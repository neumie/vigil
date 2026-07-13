// Vanishing-socket regression (app/src/sessions.ts): liveness probes can
// false-negative for a LIVE dtach master (observed: EINVAL when the socket
// dir exceeds the AF_UNIX sun_path cap — dtach serves the path, node can't
// even connect), and reap/GC used to unlink the socket file on ANY failure —
// destroying restorable sessions (masters alive, sockets gone). Invariants:
// probes are three-valued (only ECONNREFUSED proves dead), reap never
// unlinks, and persistence refuses over-long socket dirs up front. CJS
// default-import pattern per the helm test convention.

import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import * as fs from 'node:fs'
import * as net from 'node:net'
import * as os from 'node:os'
import * as path from 'node:path'
import test from 'node:test'
import sessionsModule from '../app/src/sessions.ts'

type SessionsModule = typeof import('../app/src/sessions.ts')
const { probeSocket, reapSessionIfDead, socketDirUsable, socketPath } = sessionsModule as SessionsModule

async function withSocketDir<T>(fn: () => Promise<T>): Promise<T> {
	const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'helm-reap-'))
	// '' restores "unset" for socketDir(), which gates on truthiness.
	const prev = process.env.HELM_SOCKET_DIR ?? ''
	process.env.HELM_SOCKET_DIR = dir
	try {
		return await fn()
	} finally {
		process.env.HELM_SOCKET_DIR = prev
	}
}

function listen(server: net.Server, sock: string): Promise<void> {
	return new Promise((resolve, reject) => {
		server.once('error', reject)
		server.listen(sock, resolve)
	})
}

function close(server: net.Server): Promise<void> {
	return new Promise(resolve => server.close(() => resolve()))
}

test('reap: a live socket is not dead and its file is never unlinked', () =>
	withSocketDir(async () => {
		const sock = socketPath('livesess1')
		const server = net.createServer()
		await listen(server, sock)
		try {
			assert.equal(await reapSessionIfDead('livesess1'), false)
			assert.ok(fs.existsSync(sock), 'live session socket must survive a reap check')
		} finally {
			await close(server)
		}
	}))

test('reap: a crash-leftover socket reports dead but keeps the file for startup GC', () =>
	withSocketDir(async () => {
		// True crash shape: a listener SIGKILLed mid-flight leaves the socket
		// file behind with nobody serving it → connect gives ECONNREFUSED.
		const sock = socketPath('deadsess1')
		const child = spawn(process.execPath, [
			'-e',
			`const net = require('net'); net.createServer().listen(${JSON.stringify(sock)}, () => { process.kill(process.pid, 'SIGKILL') })`,
		])
		await new Promise<void>(resolve => child.once('exit', () => resolve()))
		assert.ok(fs.existsSync(sock), 'SIGKILL leaves the socket file (the crash-leftover shape)')
		assert.equal(await reapSessionIfDead('deadsess1'), true)
		assert.ok(fs.existsSync(sock), 'reap must not unlink — listLiveSessions owns stale cleanup')
	}))

test('reap: a missing socket file is dead', () =>
	withSocketDir(async () => {
		assert.equal(await reapSessionIfDead('gonesess1'), true)
	}))

test('probe: a path over the AF_UNIX cap is unknown, never dead (EINVAL false-negative regression)', async () => {
	const longDir = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'helm-reap-')), 'x'.repeat(90))
	fs.mkdirSync(longDir, { recursive: true })
	const sock = path.join(longDir, 'aaaa1111.sock')
	fs.writeFileSync(sock, '') // stand-in for a dtach-served socket node cannot address
	assert.equal(await probeSocket(sock), 'unknown')
	// And reap must therefore report NOT dead — registry metadata survives.
	const prev = process.env.HELM_SOCKET_DIR ?? ''
	process.env.HELM_SOCKET_DIR = longDir
	try {
		assert.equal(await reapSessionIfDead('aaaa1111'), false)
		assert.ok(fs.existsSync(sock))
	} finally {
		process.env.HELM_SOCKET_DIR = prev
	}
})

test('socketDirUsable: short production-shaped dirs pass, over-cap dirs fail', () => {
	assert.equal(socketDirUsable('/tmp/helm-501'), true)
	assert.equal(socketDirUsable(`/private/tmp/${'x'.repeat(120)}`), false)
})
