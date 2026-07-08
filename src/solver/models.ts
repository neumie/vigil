import type { SolverAgent } from './agent.js'

/**
 * Curated model catalog per agent CLI — the single source for every model
 * dropdown (dashboard Settings, extension quick-switch). Ids are passed
 * verbatim to the agent's `--model` flag, and the schema stays a free string,
 * so an id missing here still works — the catalog is UI sugar, not validation.
 * Keep ordered best-first; update when providers ship new models.
 */
export interface ModelOption {
	id: string
	label: string
}

export const MODEL_CATALOG: Record<SolverAgent, ModelOption[]> = {
	claude: [
		{ id: 'claude-fable-5', label: 'Fable 5' },
		{ id: 'claude-opus-4-8', label: 'Opus 4.8' },
		{ id: 'claude-sonnet-5', label: 'Sonnet 5' },
		{ id: 'claude-haiku-4-5', label: 'Haiku 4.5' },
	],
	codex: [
		{ id: 'gpt-5.5', label: 'GPT-5.5' },
		{ id: 'gpt-5.4', label: 'GPT-5.4' },
		{ id: 'gpt-5.4-mini', label: 'GPT-5.4 mini' },
	],
}

/** Default model for the cheap AI-helper one-shots (naming/triage). */
export function defaultHelperModel(agent: SolverAgent | undefined): string {
	return agent === 'codex' ? 'gpt-5.4-mini' : 'claude-haiku-4-5'
}

export function agentModelLabel(agent: SolverAgent): string {
	return agent === 'codex' ? 'Codex' : 'Claude'
}

/**
 * Flat select options across both agents (Settings model dropdowns aren't
 * agent-scoped — the sibling Provider field can change independently).
 */
export function modelSelectOptions(): Array<{ value: string; label: string }> {
	const agents: SolverAgent[] = ['claude', 'codex']
	return agents.flatMap(agent =>
		MODEL_CATALOG[agent].map(m => ({ value: m.id, label: `${agentModelLabel(agent)} · ${m.label}` })),
	)
}
