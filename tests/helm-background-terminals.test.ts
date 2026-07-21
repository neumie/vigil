import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const renderer = readFileSync(new URL('../app/src/renderer/renderer.ts', import.meta.url), 'utf8')
const html = readFileSync(new URL('../app/src/renderer/index.html', import.meta.url), 'utf8')
const normalizedHtml = html.replace(/\s+/g, ' ')
const css = readFileSync(new URL('../app/src/renderer/styles.css', import.meta.url), 'utf8')

function functionSlice(name: string, nextName: string): string {
	const start = renderer.indexOf(`function ${name}`)
	const end = nextName ? renderer.indexOf(`function ${nextName}`, start) : renderer.length
	return renderer.slice(start, end)
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

test('background rows form an editorial list with explicit icon actions', () => {
	const render = functionSlice('renderBackgroundRows', 'onBgOutside')
	assert.match(render, /open\.addEventListener\('click', \(\) => openParked\(tab\)\)/)
	assert.match(
		render,
		/createIconButton\(\{[\s\S]*label: `Move \$\{displayName\(tab\)\} to tabs and open`[\s\S]*glyph: '⇥'/,
	)
	assert.match(render, /onClick: \(\) => restoreParked\(tab\)/)
	assert.match(render, /createIconButton\(\{[\s\S]*label: `Close \$\{displayName\(tab\)\}`[\s\S]*glyph: '×'/)
	assert.match(render, /onClick: \(\) => killParkedTab\(tab\)/)
	assert.doesNotMatch(render, /restore\.className|kill\.className/)
	assert.match(normalizedHtml, /aria-haspopup="dialog"/)
	assert.match(normalizedHtml, /<span id="bg-header-count" class="bg-header-count">0<\/span>/)
	assert.match(css, /#bg-popover\s*\{[^}]*width:\s*320px/s)
	assert.match(css, /#bg-popover\s*\{[^}]*max-height:\s*min\(480px, calc\(100vh - 48px\)\)/s)
	assert.match(css, /#bg-rows\s*\{[^}]*overflow-y:\s*auto/s)
	assert.match(css, /\.bg-row\s*\{[^}]*grid-template-columns:\s*minmax\(0, 1fr\) auto auto/s)
	assert.match(css, /\.bg-row\s*\{[^}]*min-height:\s*44px/s)
	assert.match(css, /\.bg-row\s*\{[^}]*margin:\s*0 -4px/s)
	assert.match(css, /\.bg-row\s*\{[^}]*width:\s*calc\(100% \+ 8px\)/s)
	assert.match(css, /\.bg-row\s*\{[^}]*border-radius:\s*0/s)
	assert.match(css, /\.bg-open\s*\{[^}]*display:\s*flex/s)
	assert.match(css, /\.bg-open-copy\s*\{[^}]*display:\s*grid/s)
})

test('background popover catches a click on native titlebar whitespace', () => {
	assert.match(normalizedHtml, /<div id="topbar-drag-space" class="topbar-drag-space" aria-hidden="true"\s*><\/div>/)
	assert.match(css, /\.topbar-drag-space\.popover-catcher\s*\{[^}]*-webkit-app-region:\s*no-drag/s)
	const outside = functionSlice('onBgOutside', 'onBgKeydown')
	const open = functionSlice('openBackgroundPopover', 'closeBackgroundPopover')
	const close = functionSlice('closeBackgroundPopover', '')
	assert.match(outside, /event\.target === topbarDragSpace/)
	assert.match(outside, /bgToggle\.focus\(\)/)
	assert.match(open, /topbarDragSpace\.classList\.add\('popover-catcher'\)/)
	assert.match(close, /topbarDragSpace\.classList\.remove\('popover-catcher'\)/)
})

test('background rows show only protocol-owned agent state', () => {
	const render = functionSlice('renderBackgroundRows', 'onBgOutside')
	assert.match(render, /tab\.agentRunning \|\| tab\.agentAttention/)
	assert.match(render, /createActivityIndicator/)
	assert.match(render, /const exitedState = tab\.exitCode === null \? null : `Exited \(\$\{tab\.exitCode\}\)`/)
	assert.match(render, /agentState/)
	assert.doesNotMatch(render, /['"]Running['"]/)
	assert.doesNotMatch(render, /bg-activity-slot/)
	assert.match(render, /if \(exitedState\)/)
	assert.doesNotMatch(renderer, /bg-dot|activityMuteUntil|Output after parking lights/)
	assert.match(renderer, /if \(tab\.parked\) updateBackgroundUi\(\)/)
	assert.match(renderer, /if \(activeTab\.parked\) killParkedTab\(activeTab\)/)
})

test('background rows collapse idle live terminals to one compact line', () => {
	assert.match(css, /\.bg-row\s*\{[^}]*min-height:\s*44px/s)
	assert.match(css, /\.bg-open\s*\{[^}]*display:\s*flex/s)
	assert.doesNotMatch(css, /\.bg-activity-slot\s*\{/)
})

test('closing the final background row moves focus before hiding the control', () => {
	const update = functionSlice('updateBackgroundUi', 'renderBackgroundRows')
	assert.match(update, /const focusWasInPopover = empty && bgPopover\.contains\(document\.activeElement\)/)
	assert.match(update, /if \(focusWasInPopover\) newTabButton\.focus\(\)/)
})
