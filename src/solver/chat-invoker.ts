import { unlinkSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { VigilConfig } from '../config.js'
import { log } from '../util/logger.js'
import { spawnClaude } from './spawn-claude.js'

export interface ChatResult {
	chatNeeded: boolean
	transcript: string | null
	exitCode: number | null
}

export async function invokeChatSession(
	worktreePath: string,
	prompt: string,
	config: VigilConfig,
	signal?: AbortSignal,
): Promise<ChatResult> {
	const mcpConfigPath = join(worktreePath, '.mcp.json')
	writeFileSync(
		mcpConfigPath,
		JSON.stringify({
			mcpServers: {
				vigil: {
					url: `http://${config.server.host}:${config.server.port}/mcp`,
					type: 'streamable-http',
				},
			},
		}),
	)

	const args: string[] = [
		'-p',
		'--output-format',
		'json',
		'--allowedTools',
		'mcp__vigil__vigil_create_chat,mcp__vigil__vigil_send_message,mcp__vigil__vigil_end_chat',
	]

	if (config.solver.model) {
		args.push('--model', config.solver.model)
	}

	log.info('chat-invoker', `Spawning sandboxed chat session in ${worktreePath}`)

	try {
		const result = await spawnClaude({
			args,
			cwd: worktreePath,
			prompt,
			timeoutMs: (config.chat?.timeoutMinutes ?? 120) * 60 * 1000,
			signal,
			label: 'chat-invoker',
		})
		const chatResult = parseChatOutput(result.stdout)
		return { ...chatResult, exitCode: result.exitCode }
	} finally {
		try {
			unlinkSync(mcpConfigPath)
		} catch {
			// Ignore if already removed
		}
	}
}

function parseChatOutput(stdout: string): { chatNeeded: boolean; transcript: string | null } {
	const lines = stdout.split('\n').filter(l => l.trim())

	for (const line of lines.reverse()) {
		try {
			const parsed = JSON.parse(line)
			const text = parsed.result ?? parsed.content ?? ''
			if (typeof text === 'string') {
				const jsonMatch = text.match(/\{[\s\S]*"chatNeeded"[\s\S]*\}/)
				if (jsonMatch) {
					const result = JSON.parse(jsonMatch[0])
					return {
						chatNeeded: result.chatNeeded ?? false,
						transcript: result.transcript ?? null,
					}
				}
				if (text.includes('Transcript:') || text.includes('**Vigil:**') || text.includes('**Requester:**')) {
					return { chatNeeded: true, transcript: text }
				}
			}
		} catch {
			// Not valid JSON, skip
		}
	}

	return { chatNeeded: false, transcript: null }
}
