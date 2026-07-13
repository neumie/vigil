// Background terminals: the session registry's `parked` flag must survive a
// kill/relaunch cycle (app/src/sessions.ts SessionRegistry) — a parked session
// restores as parked (popover row), a restored one as a strip tab. CJS
// default-import pattern per the helm test convention.

import assert from 'node:assert/strict'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import test from 'node:test'
import sessionsModule from '../app/src/sessions.ts'

type SessionsModule = typeof import('../app/src/sessions.ts')
const { SessionRegistry } = sessionsModule as SessionsModule

function tempRegistryFile(): string {
	return path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'helm-park-')), 'sessions.json')
}

test('parked flag survives a registry relaunch as parked', () => {
	const file = tempRegistryFile()
	const first = new SessionRegistry(file)
	first.add('aaaa1111')
	first.add('bbbb2222')
	first.setTitle('aaaa1111', 'okena')
	first.setParked('aaaa1111', true)
	first.flush()

	// "Relaunch": a fresh registry instance reading the same file.
	const second = new SessionRegistry(file)
	assert.equal(second.get('aaaa1111')?.parked, true)
	assert.equal(second.get('aaaa1111')?.lastTitle, 'okena') // title reused for the popover row
	assert.equal(second.get('bbbb2222')?.parked ?? false, false) // non-parked stays a tab
})

test('restore clears the parked flag across a relaunch', () => {
	const file = tempRegistryFile()
	const first = new SessionRegistry(file)
	first.add('cccc3333')
	first.setParked('cccc3333', true)
	first.setParked('cccc3333', false) // popover row restored to the strip
	first.flush()

	const second = new SessionRegistry(file)
	assert.equal(second.get('cccc3333')?.parked ?? false, false)
})

test('setParked ignores unknown sessions and prune drops parked metadata with the session', () => {
	const file = tempRegistryFile()
	const registry = new SessionRegistry(file)
	registry.setParked('missing1', true) // no throw, no entry created
	assert.equal(registry.get('missing1'), undefined)

	registry.add('dddd4444')
	registry.setParked('dddd4444', true)
	registry.prune(new Set()) // socket gone → session forgotten, parked flag with it
	registry.flush()
	const reloaded = new SessionRegistry(file)
	assert.equal(reloaded.get('dddd4444'), undefined)
})
