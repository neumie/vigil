// vigil:// deep-link parsing (helm/src/protocol.ts) — the contract between the
// extension's link (`vigil://item/<id>`) and helm's open-url handler.
// Default-import + destructure: helm is a CJS-context package under tsx.

import assert from 'node:assert/strict'
import test from 'node:test'
import helmProtocolModule from '../helm/src/protocol.ts'

type HelmProtocolModule = typeof import('../helm/src/protocol.ts')
const { parseVigilItemUrl } = helmProtocolModule as HelmProtocolModule

test('parses vigil://item/<id>', () => {
	assert.equal(parseVigilItemUrl('vigil://item/abc-123'), 'abc-123')
	assert.equal(parseVigilItemUrl('vigil://item/01973f2a.4d'), '01973f2a.4d')
})

test('decodes percent-encoded ids', () => {
	assert.equal(parseVigilItemUrl('vigil://item/a%20b'), 'a b')
})

test('rejects everything that is not exactly one item segment', () => {
	assert.equal(parseVigilItemUrl('vigil://item/'), null)
	assert.equal(parseVigilItemUrl('vigil://item'), null)
	assert.equal(parseVigilItemUrl('vigil://item/a/b'), null)
	assert.equal(parseVigilItemUrl('vigil://settings/x'), null)
	assert.equal(parseVigilItemUrl('https://item/abc'), null)
	assert.equal(parseVigilItemUrl('not a url'), null)
})
