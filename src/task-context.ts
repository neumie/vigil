import { PlanWorkspace } from './plan/workspace.js'
import type { TaskContext } from './providers/provider.js'

export interface PlanContext {
	/** Folder name under `<worktree>/docs/plans/` (e.g. `2026-05-20-add-user-avatar`). */
	planDirName: string
	worktreePath: string
}

/**
 * Build the task-context block for an agent prompt: the formatted task plus
 * any plan artifacts the user committed under `docs/plans/<planDirName>/`.
 */
export function buildTaskContext(task: TaskContext, ctx: PlanContext): string {
	let context = formatTaskContext(task)

	const planArtifacts = new PlanWorkspace(ctx.worktreePath, ctx.planDirName).readArtifacts()
	if (planArtifacts) {
		context += `\n## Plan Artifacts\n\nThe requester (or a prior planning session) wrote the following files to docs/plans/${ctx.planDirName}/ before this task ran. Treat them as authoritative scoping — they reflect decisions already made.\n\n${planArtifacts}`
	}

	return context
}

/**
 * Format the task's identity, description, metadata, comments, and attachments
 * as markdown. Used both for inline prompt injection and for writing
 * `docs/plans/<planDirName>/context.md` for the planning agent.
 */
export function formatTaskContext(task: TaskContext): string {
	let out = ''

	if (task.projectContext) {
		out += `Project Context:\n${task.projectContext}\n\n`
	}

	out += `Task: ${task.title}\n`

	if (task.metadata && Object.keys(task.metadata).length > 0) {
		for (const [key, value] of Object.entries(task.metadata)) {
			out += `${key}: ${value}\n`
		}
	}

	if (task.description) {
		out += `\nDescription:\n${task.description}\n`
	}

	if (task.attachments && task.attachments.length > 0) {
		out += '\nAttachments:\n'
		for (const a of task.attachments) {
			out += `- ${a.name} -> ${a.url}\n`
		}
	}

	if (task.comments && task.comments.length > 0) {
		out += `\nComments (${task.comments.length}):\n`
		for (const c of task.comments) {
			out += `\n- [${c.createdAt}] ${c.author}\n${c.body || '(no text)'}\n`
		}
	}

	return out
}
