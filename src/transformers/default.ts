import type { TaskContext } from '../providers/provider.js'

export function defaultTransformer(task: TaskContext): string {
	let context = ''

	if (task.projectContext) {
		context += `Project Context:\n${task.projectContext}\n\n`
	}

	context += `Task: ${task.title}\n`

	if (task.metadata && Object.keys(task.metadata).length > 0) {
		for (const [key, value] of Object.entries(task.metadata)) {
			context += `${key}: ${value}\n`
		}
	}

	if (task.description) {
		context += `\nDescription:\n${task.description}\n`
	}

	if (task.attachments && task.attachments.length > 0) {
		context += '\nAttachments:\n'
		for (const a of task.attachments) {
			context += `- ${a.name} -> ${a.url}\n`
		}
	}

	if (task.comments && task.comments.length > 0) {
		context += `\nComments (${task.comments.length}):\n`
		for (const c of task.comments) {
			context += `\n- [${c.createdAt}] ${c.author}\n${c.body || '(no text)'}\n`
		}
	}

	return context
}
