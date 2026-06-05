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

export function buildInteractiveAgentCommand(solverConfig: VigilConfig['solver'], promptPath: string): string {
	const agent = resolveSolverAgent(solverConfig)
	const args =
		agent === 'codex'
			? ['codex', '--dangerously-bypass-approvals-and-sandbox', '--sandbox', 'danger-full-access']
			: ['claude', '--dangerously-skip-permissions']

	if (solverConfig.model) {
		args.push('--model', solverConfig.model)
	}

	return [...args.map(shellQuote), `"$(cat ${shellQuote(promptPath)})"`].join(' ')
}

export function agentLabelFromConfig(solverConfig: VigilConfig['solver']): string {
	return solverAgentLabel(resolveSolverAgent(solverConfig))
}

function shellQuote(value: string): string {
	return `'${value.replace(/'/g, "'\\''")}'`
}
