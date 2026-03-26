import type { ClaudeEvent } from '../types.js'

/**
 * Parse Claude Code's JSON output (from --output-format json) into a summarized event timeline.
 */
export function parseClaudeOutput(stdout: string): ClaudeEvent[] {
	const events: ClaudeEvent[] = []
	try {
		const messages = JSON.parse(stdout)
		if (!Array.isArray(messages)) return events

		for (const msg of messages) {
			if (msg.type === 'assistant' && Array.isArray(msg.content)) {
				for (const block of msg.content) {
					if (block.type === 'tool_use') {
						const event = parseToolUse(block)
						if (event) events.push(event)
					}
				}
			}
			if (msg.type === 'tool_result' || msg.type === 'result') {
				// Tool results are tied to tool_use via id, skip for now
			}
		}
	} catch {
		// Not valid JSON — no events to extract
	}
	return events
}

function parseToolUse(block: { name?: string; input?: Record<string, unknown> }): ClaudeEvent | null {
	const name = block.name ?? ''
	const input = block.input ?? {}

	if (name === 'Read' || name === 'read_file') {
		return {
			type: 'file_read',
			detail: `Read ${input.file_path ?? input.path ?? 'file'}`,
			file: (input.file_path ?? input.path) as string | undefined,
		}
	}

	if (name === 'Edit' || name === 'edit_file') {
		return {
			type: 'edit',
			detail: `Edited ${input.file_path ?? input.path ?? 'file'}`,
			file: (input.file_path ?? input.path) as string | undefined,
		}
	}

	if (name === 'Write' || name === 'write_file') {
		return {
			type: 'edit',
			detail: `Created ${input.file_path ?? input.path ?? 'file'}`,
			file: (input.file_path ?? input.path) as string | undefined,
		}
	}

	if (name === 'Bash' || name === 'execute_bash') {
		const cmd = (input.command ?? '') as string
		return {
			type: 'command',
			detail: cmd.length > 100 ? `${cmd.slice(0, 100)}...` : cmd,
		}
	}

	if (name === 'Glob' || name === 'Grep') {
		return {
			type: 'file_read',
			detail: `${name}: ${input.pattern ?? ''}`,
		}
	}

	// Generic tool call
	return {
		type: 'tool_call',
		detail: `${name}`,
	}
}
