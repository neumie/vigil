export interface TerminalKeyEvent {
	key: string
	metaKey: boolean
	ctrlKey: boolean
	altKey: boolean
	shiftKey: boolean
}

export interface TerminalShortcut {
	/** Bytes written directly to the PTY instead of xterm's normal translation. */
	input: string
	/** Prevent xterm from also emitting the original key. */
	suppress: boolean
}

/**
 * Translate native macOS editing shortcuts that Terminal.app normally handles
 * for the shell but Chromium/xterm otherwise reduces to the unmodified key.
 */
export function terminalShortcut(platform: string, event: TerminalKeyEvent): TerminalShortcut | null {
	if (
		platform === 'darwin' &&
		event.key === 'Backspace' &&
		event.metaKey &&
		!event.ctrlKey &&
		!event.altKey &&
		!event.shiftKey
	) {
		return { input: '\x15', suppress: true }
	}

	return null
}

export default { terminalShortcut }
