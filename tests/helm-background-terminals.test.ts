import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const renderer = readFileSync(new URL('../app/src/renderer/renderer.ts', import.meta.url), 'utf8')
const css = readFileSync(new URL('../app/src/renderer/styles.css', import.meta.url), 'utf8')

function functionSlice(name: string, nextName: string): string {
	return renderer.slice(renderer.indexOf(`function ${name}`), renderer.indexOf(`function ${nextName}`))
}

test('opening a background terminal activates it without restoring ownership', () => {
	const open = functionSlice('openParked', 'restoreParked')
	assert.match(open, /parked\.includes\(tab\)/)
	assert.match(open, /activate\(tab\)/)
	assert.doesNotMatch(open, /parked\.splice|setParked|tab\.parked\s*=/)

	const restore = functionSlice('restoreParked', 'killParkedTab')
	assert.match(restore, /parked\.splice/)
	assert.match(restore, /tab\.parked = false/)
	assert.match(restore, /setParked\(tab\.sessionId, false\)/)
})

test('background rows expose Open, move-to-Tab, and Close as separate controls', () => {
	const render = functionSlice('renderBackgroundRows', 'onBgOutside')
	assert.match(render, /open\.addEventListener\('click', \(\) => openParked\(tab\)\)/)
	assert.match(render, /restore\.textContent = 'Tab'/)
	assert.match(render, /restore\.addEventListener\('click', \(\) => restoreParked\(tab\)\)/)
	assert.match(render, /kill\.addEventListener\('click', \(\) => killParkedTab\(tab\)\)/)
	assert.match(css, /#bg-popover\s*\{[^}]*width:\s*300px/s)
	assert.match(css, /\.bg-row\s*\{[^}]*grid-template-columns:\s*minmax\(0, 1fr\) auto auto/s)
})

test('background rows reuse protocol-owned ActivityIndicator state', () => {
	const render = functionSlice('renderBackgroundRows', 'onBgOutside')
	assert.match(render, /tab\.agentRunning \|\| tab\.agentAttention/)
	assert.match(render, /createActivityIndicator/)
	assert.doesNotMatch(renderer, /bg-dot|activityMuteUntil|Output after parking lights/)
	assert.match(renderer, /if \(tab\.parked\) updateBackgroundUi\(\)/)
	assert.match(renderer, /if \(activeTab\.parked\) killParkedTab\(activeTab\)/)
})
