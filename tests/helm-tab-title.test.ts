// Tab title arbitration (app/src/renderer/tab-title.ts): the pure decision
// core behind the tab-label behavior — manual rename PIN (customName, OSC
// never applies) and restored-title stickiness (after a dtach reattach,
// shell-default-class titles must not clobber the saved label for a short
// window; real titles always apply; fresh tabs keep today's behavior).
// Diagnosis background: oh-my-zsh emits OSC 2 `user@host` at every idle
// prompt, which the normalizer maps to the literal 'zsh' fallback — exactly
// the "named tab comes back as zsh" clobber. CJS default-import pattern per
// the helm test convention.

import assert from 'node:assert/strict'
import test from 'node:test'
import tabTitleModule from '../app/src/renderer/tab-title.ts'

type TabTitleModule = typeof import('../app/src/renderer/tab-title.ts')
const { TITLE_STICKY_WINDOW_MS, decideTabTitle, isShellDefaultTitle, normalizeTabTitle } =
	tabTitleModule as TabTitleModule

test('normalizeTabTitle: user@host collapses to zsh; user@host:path keeps the tail; others pass through', () => {
	assert.equal(normalizeTabTitle(''), 'zsh')
	assert.equal(normalizeTabTitle('   '), 'zsh')
	assert.equal(normalizeTabTitle('jakubneumann@neubook'), 'zsh') // OMZ idle title (observed)
	assert.equal(normalizeTabTitle('user@host:'), 'zsh')
	assert.equal(normalizeTabTitle('user@host:~/code/helm'), 'helm')
	assert.equal(normalizeTabTitle('vim notes.md'), 'vim notes.md')
	assert.equal(normalizeTabTitle('✳ fix tab names'), '✳ fix tab names')
})

test('isShellDefaultTitle: exactly the normalized zsh fallback class', () => {
	assert.equal(isShellDefaultTitle('zsh'), true)
	assert.equal(isShellDefaultTitle(normalizeTabTitle('user@host')), true)
	assert.equal(isShellDefaultTitle('helm'), false)
	assert.equal(isShellDefaultTitle('vim'), false)
})

const base = { pinned: false, restored: false, titleSettled: false, sinceAttachMs: 0 }

test("fresh tab: every title applies immediately (today's behavior exactly)", () => {
	assert.equal(decideTabTitle({ ...base, incoming: 'zsh' }), true)
	assert.equal(decideTabTitle({ ...base, incoming: 'vim' }), true)
})

test('restored tab: shell-default title is suppressed inside the sticky window', () => {
	assert.equal(decideTabTitle({ ...base, restored: true, sinceAttachMs: 100, incoming: 'zsh' }), false)
	// While the spawn is still in flight (attachedAt = Infinity → -Infinity age).
	assert.equal(
		decideTabTitle({ ...base, restored: true, sinceAttachMs: Number.NEGATIVE_INFINITY, incoming: 'zsh' }),
		false,
	)
})

test('restored tab: a REAL title applies immediately, even inside the window', () => {
	assert.equal(decideTabTitle({ ...base, restored: true, sinceAttachMs: 100, incoming: 'vim' }), true)
	assert.equal(decideTabTitle({ ...base, restored: true, sinceAttachMs: 100, incoming: '✳ claude' }), true)
})

test('restored tab: shell-default title applies once the window expired (live follow intact)', () => {
	assert.equal(
		decideTabTitle({ ...base, restored: true, sinceAttachMs: TITLE_STICKY_WINDOW_MS, incoming: 'zsh' }),
		true,
	)
	assert.equal(decideTabTitle({ ...base, restored: true, sinceAttachMs: 60_000, incoming: 'zsh' }), true)
})

test('restored tab: once a real title settled it, default titles apply inside the window too', () => {
	// vim exits 1s after reattach → the prompt's default title must follow.
	assert.equal(
		decideTabTitle({ ...base, restored: true, titleSettled: true, sinceAttachMs: 1000, incoming: 'zsh' }),
		true,
	)
})

test('sticky window is overridable (HELM_TITLE_STICKY_MS test hook)', () => {
	const short = { ...base, restored: true, incoming: 'zsh', stickyWindowMs: 500 }
	assert.equal(decideTabTitle({ ...short, sinceAttachMs: 400 }), false)
	assert.equal(decideTabTitle({ ...short, sinceAttachMs: 600 }), true)
})

test('pinned tab: no OSC title ever applies — real, default, early, late', () => {
	assert.equal(decideTabTitle({ ...base, pinned: true, incoming: 'vim' }), false)
	assert.equal(decideTabTitle({ ...base, pinned: true, sinceAttachMs: 60_000, incoming: 'zsh' }), false)
	assert.equal(
		decideTabTitle({
			...base,
			pinned: true,
			restored: true,
			titleSettled: true,
			sinceAttachMs: 60_000,
			incoming: 'vim',
		}),
		false,
	)
})
