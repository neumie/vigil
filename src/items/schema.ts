import { z } from 'zod'

export const itemKindSchema = z.enum(['solve', 'ralph', 'harden'])

export const itemStatusSchema = z.enum([
	'unverified',
	'planned',
	'queued',
	'processing',
	'review',
	'completed',
	'failed',
	'cancelled',
	'skipped',
])

export const itemSourceSchema = z
	.object({
		provider: z.string().min(1),
		externalId: z.string().min(1),
		url: z.string().url().optional(),
	})
	.strict()

export const solveItemPayloadSchema = z
	.object({
		kind: z.literal('solve'),
		prompt: z.string().min(1),
	})
	.strict()

export const ralphItemPayloadSchema = z
	.object({
		kind: z.literal('ralph'),
		prdPath: z.string().min(1),
		mode: z.enum(['once', 'afk']).optional(),
		provider: z.enum(['claude', 'codex']).optional(),
		model: z.string().min(1).optional(),
		effort: z.string().min(1).optional(),
		iterations: z.number().int().positive().optional(),
		noOversee: z.boolean().optional(),
	})
	.strict()

export const hardenItemPayloadSchema = z
	.object({
		kind: z.literal('harden'),
		target: z.string().min(1),
		rounds: z.number().int().positive().optional(),
	})
	.strict()

export const itemPayloadSchema = z.discriminatedUnion('kind', [
	solveItemPayloadSchema,
	ralphItemPayloadSchema,
	hardenItemPayloadSchema,
])

export const itemRecordSchema = z.object({
	id: z.string().min(1),
	kind: itemKindSchema,
	status: itemStatusSchema,
	projectSlug: z.string().min(1),
	title: z.string().min(1),
	source: itemSourceSchema.nullable(),
	baseRef: z.string().min(1),
	spawner: z.string().min(1).nullable(),
	groupId: z.string().nullable(),
	payload: itemPayloadSchema,
	worktreePath: z.string().nullable(),
	branchName: z.string().nullable(),
	planDirName: z.string().nullable(),
	almanacRunId: z.string().nullable(),
	createdAt: z.string().min(1),
	queuedAt: z.string().nullable(),
	startedAt: z.string().nullable(),
	completedAt: z.string().nullable(),
	updatedAt: z.string().min(1),
	errorMessage: z.string().nullable(),
	errorPhase: z.string().nullable(),
	resultSummary: z.string().nullable(),
	solveInputSnapshot: z.string().nullable(),
	prUrl: z.string().nullable(),
})

export type ItemKind = z.infer<typeof itemKindSchema>
export type ItemStatus = z.infer<typeof itemStatusSchema>
export type ItemSource = z.infer<typeof itemSourceSchema>
export type ItemPayload = z.infer<typeof itemPayloadSchema>
export type ItemRecord = z.infer<typeof itemRecordSchema>
