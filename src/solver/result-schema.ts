import { z } from 'zod'
import { tierSchema } from '../db/task-schema.js'

/**
 * Single source of truth for the agent's structured result (`solver-result.json`).
 *
 * The TS type (`SolverResult`) is `z.infer` of this schema, so the type, the
 * read-time validation, and the JSON contract in the solver prompt all derive
 * from one place. `tier` reuses the DB's `tierSchema` — the same enum the worker
 * writes into the `tasks.tier` column — so the two can't drift.
 *
 * Note: `z.object` strips unknown keys, so any field the agent may write (e.g.
 * `prUrl` after `/almanac:ship`) MUST be declared here or it is silently dropped.
 */
export const solverResultSchema = z.object({
	tier: tierSchema,
	confidence: z.number().min(0).max(1),
	summary: z.string(),
	filesChanged: z.array(z.string()).default([]),
	analysis: z.string().optional(),
	questionsForRequester: z.array(z.string()).optional(),
	remainingWork: z.array(z.string()).optional(),
	prReady: z.boolean(),
	prTitle: z.string().optional(),
	prBody: z.string().optional(),
	prUrl: z.string().optional(),
})

export type SolverResult = z.infer<typeof solverResultSchema>
