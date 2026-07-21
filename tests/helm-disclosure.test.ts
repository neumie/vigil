import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const ui = readFileSync(new URL('../app/src/renderer/sidebar/ui.tsx', import.meta.url), 'utf8')
const css = readFileSync(new URL('../app/src/renderer/sidebar/detail-redesign.css', import.meta.url), 'utf8')
const story = readFileSync(new URL('../app/src/renderer/sidebar/Disclosure.stories.tsx', import.meta.url), 'utf8')

test('Disclosure is a neutral 28px control with an explicit open-state mark', () => {
	assert.match(ui, /className="disclosure-mark"/)
	assert.match(ui, /open \? '−' : '\+'/)
	assert.match(css, /\.detail-disclosure\s*\{[^}]*min-height:\s*28px/s)
	assert.match(css, /\.detail-disclosure\s*\{[^}]*background:\s*var\(--fill-subtle\)/s)
	assert.match(css, /\.detail-disclosure\[aria-expanded="true"\]/)
	assert.match(story, /title: 'Primitives\/Disclosure'/)
})
