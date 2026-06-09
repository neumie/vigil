import type { VigilConfig } from '../config.js'
import type { SolverAgent } from './agent.js'
import { solverAgentLabel } from './agent.js'

interface AgentInvocation {
	agent: SolverAgent
	command: string
	args: string[]
	label: string
}

export function resolveSolverAgent(solverConfig: VigilConfig['solver']): SolverAgent {
	return solverConfig.agent ?? 'claude'
}

export function buildHeadlessAgentInvocation(solverConfig: VigilConfig['solver']): AgentInvocation {
	const agent = resolveSolverAgent(solverConfig)

	if (agent === 'codex') {
		const args = ['exec', '--dangerously-bypass-approvals-and-sandbox', '--sandbox', 'danger-full-access', '-']
		if (solverConfig.model) args.push('--model', solverConfig.model)
		return { agent, command: 'codex', args, label: 'codex-invoker' }
	}

	const args: string[] = ['-p', '--output-format', 'json', '--dangerously-skip-permissions']
	if (solverConfig.model) {
		args.push('--model', solverConfig.model)
	}
	if (solverConfig.maxBudgetUsd) {
		args.push('--max-turns', '100')
	}
	return { agent, command: 'claude', args, label: 'claude-invoker' }
}

/**
 * Build the one-line shell command Okena types into a terminal.
 *
 * `promptPath` is resolved relative to `worktreePath`, so the command `cd`s into
 * the worktree first. This is load-bearing: a terminal Okena auto-creates with a
 * worktree starts in the worktree, but one made later via `create_terminal`
 * (every re-run of an existing task) does NOT — without the `cd`, the relative
 * `cat` fails with "No such file or directory" and the agent would edit the
 * wrong tree. Always pass the worktree path; never rely on the terminal's cwd.
 */
export function buildInteractiveAgentCommand(
	solverConfig: VigilConfig['solver'],
	promptPath: string,
	worktreePath: string,
): string {
	const agent = resolveSolverAgent(solverConfig)
	const args =
		agent === 'codex'
			? ['codex', '--dangerously-bypass-approvals-and-sandbox', '--sandbox', 'danger-full-access']
			: ['claude', '--dangerously-skip-permissions']

	if (solverConfig.model) {
		args.push('--model', solverConfig.model)
	}

	const invocation = [...args.map(shellQuote), `"$(cat ${shellQuote(promptPath)})"`].join(' ')
	return `cd ${shellQuote(worktreePath)} && ${invocation}`
}

export function agentLabelFromConfig(solverConfig: VigilConfig['solver']): string {
	return solverAgentLabel(resolveSolverAgent(solverConfig))
}

function shellQuote(value: string): string {
	return `'${value.replace(/'/g, "'\\''")}'`
}
