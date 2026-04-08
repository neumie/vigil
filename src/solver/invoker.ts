import type { VigilConfig } from '../config.js'
import { log } from '../util/logger.js'
import { type SpawnClaudeResult, spawnClaude } from './spawn-claude.js'

export type InvokeResult = SpawnClaudeResult

export async function invokeClaude(
	worktreePath: string,
	prompt: string,
	solver: VigilConfig['solver'],
	signal?: AbortSignal,
	outputLogPath?: string,
): Promise<InvokeResult> {
	const args: string[] = ['-p', '--output-format', 'json', '--dangerously-skip-permissions']

	if (solver.model) {
		args.push('--model', solver.model)
	}
	if (solver.maxBudgetUsd) {
		args.push('--max-turns', '100')
	}

	log.info('invoker', `Spawning claude in ${worktreePath}`, { model: solver.model ?? 'default' })

	return spawnClaude({
		args,
		cwd: worktreePath,
		prompt,
		timeoutMs: solver.timeoutMinutes * 60 * 1000,
		signal,
		logPath: outputLogPath,
		label: 'invoker',
	})
}
