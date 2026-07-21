import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const detailPage = readFileSync(new URL('../app/src/renderer/sidebar/DetailPage.tsx', import.meta.url), 'utf8')

test('planning reports the session start without a false completion toast', () => {
	const start = detailPage.indexOf('\tconst plan = () =>')
	const end = detailPage.indexOf('\n\tconst sourceTask', start)
	assert.notEqual(start, -1)
	assert.notEqual(end, -1)
	const plan = detailPage.slice(start, end)
	assert.match(plan, /planning started/)
	assert.match(plan, /undefined,\s*null,\s*\)/)
	assert.doesNotMatch(plan, /complete/)
})
