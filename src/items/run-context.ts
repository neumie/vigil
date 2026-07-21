import { z } from 'zod'
import type { TaskContext } from '../providers/provider.js'

export const MAX_RUN_CONTEXT_MARKDOWN_LENGTH = 200_000
export const MAX_RUN_CONTEXT_BLOCKS_JSON_LENGTH = 750_000

/**
 * Lossless editor state plus the Markdown projection sent to planning and
 * execution. The daemon treats `blocks` as opaque JSON owned by the desktop
 * editor; only `markdown` crosses into the agent prompt.
 */
export const runContextDraftSchema = z
	.object({
		version: z.literal(1),
		blocks: z.array(z.record(z.string(), z.unknown())).max(2_000),
		markdown: z.string().max(MAX_RUN_CONTEXT_MARKDOWN_LENGTH),
	})
	.strict()

export const runContextDocumentSchema = runContextDraftSchema
	.extend({
		updatedAt: z.string().datetime(),
	})
	.strict()

export type RunContextDraft = z.infer<typeof runContextDraftSchema>
export type RunContextDocument = z.infer<typeof runContextDocumentSchema>

export class RunContextConflictError extends Error {
	constructor() {
		super('Run context changed in another editor')
		this.name = 'RunContextConflictError'
	}
}

export function parseRunContextDraft(input: unknown): RunContextDraft {
	const draft = runContextDraftSchema.parse(input)
	if (JSON.stringify(draft.blocks).length > MAX_RUN_CONTEXT_BLOCKS_JSON_LENGTH) {
		throw new Error(`Run context editor state exceeds ${MAX_RUN_CONTEXT_BLOCKS_JSON_LENGTH} characters`)
	}
	return draft
}

/**
 * A saved run-context document replaces only source-authored narrative and
 * comments. Identity, project metadata, source URL, and attachments remain
 * server-owned so an editor operation cannot silently detach the run from its
 * Item or files.
 */
export function applyRunContextDocument(task: TaskContext, document: RunContextDocument | null): TaskContext {
	if (!document) return task
	const markdown = document.markdown.trim()
	return {
		...task,
		description: markdown || undefined,
		descriptionBlocks: undefined,
		comments: undefined,
	}
}
