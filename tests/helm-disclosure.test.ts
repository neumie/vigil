import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const ui = readFileSync(new URL('../app/src/renderer/sidebar/ui.tsx', import.meta.url), 'utf8')
const css = readFileSync(new URL('../app/src/renderer/sidebar/detail-redesign.css', import.meta.url), 'utf8')
const story = readFileSync(new URL('../app/src/renderer/sidebar/Disclosure.stories.tsx', import.meta.url), 'utf8')

test('Disclosure is a quiet action in the flat-group header', () => {
	assert.match(ui, /<Card label=\{heading\} trailing=\{action\}>/)
	assert.match(ui, /className="disclosure-action"/)
	assert.match(ui, /aria-expanded=\{open\}/)
	assert.match(ui, /aria-controls=\{contentId\}/)
	assert.match(ui, /<div id=\{contentId\} className="disclosure-content" hidden=\{!open\}>/)
	assert.match(ui, /\{open \? children : null\}/)
	assert.doesNotMatch(ui, /className="disclosure-mark"/)
	assert.match(css, /\.disclosure-action\s*\{[^}]*min-height:\s*24px/s)
	assert.match(css, /\.disclosure-action\s*\{[^}]*background:\s*transparent/s)
	assert.match(css, /\.disclosure-action:hover\s*\{[^}]*background:\s*var\(--fill-subtle\)/s)
	assert.match(css, /\.disclosure-content\[hidden\]\s*\{[^}]*display:\s*none/s)
	assert.match(story, /title: 'Compositions\/Disclosure group'/)
})
