import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import type { TaskContext } from '../providers/provider.js'
import type { TransformerContext } from './transformer.js'

export function defaultTransformer(task: TaskContext, ctx: TransformerContext): string {
	let context = formatTaskContext(task)

	const planArtifacts = readPlanArtifacts(ctx.worktreePath, ctx.planDirName)
	if (planArtifacts) {
		context += `\n## Plan Artifacts\n\nThe requester (or a prior planning session) wrote the following files to docs/plans/${ctx.planDirName}/ before this task ran. Treat them as authoritative scoping — they reflect decisions already made.\n\n${planArtifacts}`
	}

	return context
}

/**
 * Format the task's identity, description, metadata, comments, and attachments
 * as markdown. Used both by the default transformer (inline injection in the
 * solver prompt) and by the plan endpoint (writing `docs/plans/<planDirName>/context.md`
 * for the planning agent to read).
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

function readPlanArtifacts(worktreePath: string, planDirName: string): string | null {
	const plansDir = join(worktreePath, 'docs', 'plans', planDirName)
	if (!existsSync(plansDir)) return null

	const entries = readdirSync(plansDir)
		.filter(name => name.endsWith('.md'))
		.map(name => {
			const fullPath = join(plansDir, name)
			return { name, fullPath, mtime: statSync(fullPath).mtimeMs }
		})
		.sort((a, b) => a.mtime - b.mtime)

	if (entries.length === 0) return null

	let out = ''
	for (const entry of entries) {
		const content = readFileSync(entry.fullPath, 'utf-8')
		const mtimeIso = new Date(entry.mtime).toISOString()
		out += `<plan_artifact path="docs/plans/${planDirName}/${entry.name}" mtime="${mtimeIso}">\n${content}\n</plan_artifact>\n\n`
	}
	return out
}
