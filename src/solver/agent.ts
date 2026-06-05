import { z } from 'zod'

export const solverAgentSchema = z.enum(['claude', 'codex'])

export type SolverAgent = z.infer<typeof solverAgentSchema>

export function solverAgentLabel(agent: SolverAgent): string {
	return agent === 'codex' ? 'Codex' : 'Claude Code'
}
