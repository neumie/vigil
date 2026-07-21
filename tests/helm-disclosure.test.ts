import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const ui = readFileSync(new URL('../app/src/renderer/sidebar/ui.tsx', import.meta.url), 'utf8')
const css = readFileSync(new URL('../app/src/renderer/sidebar/detail-redesign.css', import.meta.url), 'utf8')
const story = readFileSync(new URL('../app/src/renderer/sidebar/Disclosure.stories.tsx', import.meta.url), 'utf8')

test('Disclosure uses the shared quiet Btn in the flat-group header', () => {
	assert.match(ui, /<Card label=\{heading\} trailing=\{action\}>/)
	assert.match(ui, /<Btn\s+tone="quiet"\s+sm\s+ariaExpanded=\{open\}\s+ariaControls=\{contentId\}/s)
	assert.match(ui, /aria-expanded=\{ariaExpanded\}/)
	assert.match(ui, /aria-controls=\{ariaControls\}/)
	assert.match(ui, /<div id=\{contentId\} className="disclosure-content" hidden=\{!open\}>/)
	assert.match(ui, /\{open \? children : null\}/)
	assert.doesNotMatch(ui, /className="disclosure-action"/)
	assert.match(css, /\.disclosure-content\[hidden\]\s*\{[^}]*display:\s*none/s)
	assert.match(story, /title: 'Compositions\/Disclosure group'/)
	assert.doesNotMatch(story, /run-caption/)
})
