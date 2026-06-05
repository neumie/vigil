import type { VigilConfig } from '../config.js'
import { log } from '../util/logger.js'
import { buildHeadlessAgentInvocation } from './agent-command.js'
import { solverAgentLabel } from './agent.js'
import type { SolverAgent } from './agent.js'
import { type SpawnClaudeResult, spawnClaude } from './spawn-claude.js'

export type InvokeResult = SpawnClaudeResult & { agent: SolverAgent }

export async function invokeAgent(
	worktreePath: string,
	prompt: string,
	solver: VigilConfig['solver'],
	signal?: AbortSignal,
	outputLogPath?: string,
): Promise<InvokeResult> {
	const invocation = buildHeadlessAgentInvocation(solver)
	const displayName = solverAgentLabel(invocation.agent)

	log.info('invoker', `Spawning ${displayName} in ${worktreePath}`, { model: solver.model ?? 'default' })

	const result = await spawnClaude({
		command: invocation.command,
		args: invocation.args,
		cwd: worktreePath,
		prompt,
		timeoutMs: solver.timeoutMinutes * 60 * 1000,
		signal,
		logPath: outputLogPath,
		label: invocation.label,
		displayName,
	})
	return { ...result, agent: invocation.agent }
}
