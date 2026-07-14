// macOS-native terminal editing shortcuts translated at Helm's xterm boundary.
// Terminal.app-specific Karabiner rules do not apply inside the Electron app.

import assert from 'node:assert/strict'
import test from 'node:test'
import keybindingsModule from '../app/src/renderer/terminal-keybindings.ts'

type KeybindingsModule = typeof import('../app/src/renderer/terminal-keybindings.ts')
const { terminalShortcut } = keybindingsModule as KeybindingsModule

const commandBackspace = {
	key: 'Backspace',
	metaKey: true,
	ctrlKey: false,
	altKey: false,
	shiftKey: false,
}

test('Cmd+Backspace sends Ctrl+U and suppresses xterm on macOS', () => {
	assert.deepEqual(terminalShortcut('darwin', commandBackspace), {
		input: '\x15',
		suppress: true,
	})
})

test('other platforms and modified Backspace combinations pass through', () => {
	assert.equal(terminalShortcut('linux', commandBackspace), null)
	assert.equal(terminalShortcut('darwin', { ...commandBackspace, metaKey: false }), null)
	assert.equal(terminalShortcut('darwin', { ...commandBackspace, shiftKey: true }), null)
	assert.equal(terminalShortcut('darwin', { ...commandBackspace, altKey: true }), null)
})
