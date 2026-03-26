interface TaskContext {
	id: string
	title?: string | null
	status?: string | null
	priority?: string | null
	dueDate?: string | null
	timeEstimate?: number | null
	module?: { name?: string | null } | null
	description?: {
		data?: unknown
		references?: Array<{
			file?: { url?: string | null; fileName?: string | null; fileType?: string | null } | null
		}> | null
	} | null
	comments?: Array<{
		id: string
		createdAt?: string | null
		sourceType?: string | null
		isPublic?: boolean | null
		content?: { data?: unknown } | null
		person?: { tenantPerson?: { name?: string | null; email?: string | null } | null } | null
	}> | null
	project?: {
		id: string
		name?: string | null
		slug?: string | null
		repositoryUrl?: string | null
		aiMode?: string | null
		description?: { data?: unknown } | null
		contexts?: Array<{ title?: string | null; markdown?: string | null }> | null
	} | null
}

const SOLVER_INSTRUCTIONS = `You are solving a task from a project management system. Read the task context below, then follow these steps:

## Step 1: Explore the codebase
- Read CLAUDE.md if it exists
- Understand the project structure, conventions, and tech stack
- Find code relevant to the task

## Step 2: Assess complexity
Based on the task description and your codebase exploration, classify this task into one of four tiers:

- **TRIVIAL**: Simple, well-defined change. Examples: typo fix, copy change, config update, adding a straightforward field. You are highly confident you can solve it completely and correctly.
- **SIMPLE**: Clear requirement with a bounded scope. Examples: adding a new API endpoint following existing patterns, implementing a form field, writing a utility function. You can solve it fully but it requires some thought.
- **COMPLEX**: Multi-step change, touches multiple modules, or has notable uncertainty. Examples: refactoring, new feature with edge cases, performance optimization. You should attempt a partial solution and document what remains.
- **UNCLEAR**: Key details are missing. The task cannot be meaningfully started without clarification. Do NOT attempt any code changes.

## Step 3: Take action based on tier

### If TRIVIAL or SIMPLE:
- Implement the complete solution
- Make clean, focused commits
- Ensure existing patterns are followed
- Run any available linters/formatters

### If COMPLEX:
- Implement as much as you reasonably can
- Focus on the core changes, note what remains
- Make clean commits for what you completed
- Write a detailed analysis of remaining work

### If UNCLEAR:
- Do NOT make any code changes
- Write a detailed analysis of what information is missing
- List specific questions that need answers

## Step 4: Write result file
When finished, create a file called \`.solver-result.json\` in the repository root with this exact structure:

\`\`\`json
{
  "tier": "trivial|simple|complex|unclear",
  "confidence": 0.0-1.0,
  "summary": "Brief description of what was done or analyzed",
  "filesChanged": ["path/to/file1.ts", "path/to/file2.ts"],
  "analysis": "Detailed analysis (for complex/unclear tiers)",
  "questionsForRequester": ["Question 1?", "Question 2?"],
  "remainingWork": ["Item 1", "Item 2"],
  "prReady": true|false,
  "prTitle": "Suggested PR title",
  "prBody": "Suggested PR body in markdown"
}
\`\`\`

Set \`prReady\` to:
- \`true\` for TRIVIAL (merge-ready PR)
- \`true\` for SIMPLE (draft PR)
- \`false\` for COMPLEX (branch only, no PR)
- \`false\` for UNCLEAR (no code changes)

---

`

export function buildPrompt(task: TaskContext): string {
	let context = ''

	// Project context
	if (task.project) {
		context += `Project: ${task.project.name} (slug: ${task.project.slug})\n`

		if (task.project.description?.data) {
			const text = extractPlainText(task.project.description.data)
			if (text) context += `\nProject Description:\n${text}\n`
		}

		const contexts = task.project.contexts ?? []
		if (contexts.length > 0) {
			context += '\nProject Context Documents:\n'
			for (const ctx of contexts) {
				context += `\n### ${ctx.title ?? 'Untitled'}\n`
				if (ctx.markdown) {
					const text = ctx.markdown.slice(0, 3000) + (ctx.markdown.length > 3000 ? '...' : '')
					context += `${text}\n`
				}
			}
		}
	}

	// Task context
	context += `\n\nTask: ${task.title}\n`
	context += `Status: ${task.status}, Priority: ${task.priority}\n`
	if (task.dueDate) context += `Due date: ${task.dueDate}\n`
	if (task.timeEstimate) context += `Estimate: ${task.timeEstimate}h\n`
	if (task.module?.name) context += `Module: ${task.module.name}\n`

	if (task.description?.data) {
		const text = extractPlainText(task.description.data)
		if (text) context += `\nTask Description:\n${text}\n`

		const files = collectFiles(task.description)
		if (files.length > 0) {
			context += '\nTask Files/Images:\n'
			for (const f of files) {
				context += `- ${f.fileName ?? f.url ?? 'file'} (${f.fileType ?? 'file'}) -> ${f.url ?? 'missing'}\n`
			}
		}
	}

	const comments = task.comments ?? []
	if (comments.length > 0) {
		context += `\nTask Comments (${comments.length}):\n`
		for (const comment of comments) {
			const author = comment.person?.tenantPerson?.name ?? comment.person?.tenantPerson?.email ?? 'Unknown'
			const visibility = comment.isPublic ? 'public' : 'internal'
			context += `\n- [${comment.createdAt ?? '?'}] ${author} (${visibility}, source: ${comment.sourceType ?? 'manual'})\n`
			if (comment.content?.data) {
				const text = extractPlainText(comment.content.data)
				context += text ? `${text}\n` : '(no text)\n'
			} else {
				context += '(no text)\n'
			}
		}
	}

	return `${SOLVER_INSTRUCTIONS}## Task Context\n\n${context}`
}

/**
 * Extract plain text from SlateJS JSON data.
 * Mirrors TaskContextBuilder.extractPlainTextFallback from ClientCare.
 */
export function extractPlainText(value: unknown, depth = 0): string {
	if (depth > 10 || value === null || value === undefined) return ''
	if (typeof value === 'string') return value.trim()
	if (Array.isArray(value)) {
		return value
			.map(item => extractPlainText(item, depth + 1))
			.filter(Boolean)
			.join(' ')
			.replace(/\s+/g, ' ')
			.trim()
	}
	if (typeof value !== 'object') return ''

	const obj = value as Record<string, unknown>
	const chunks: string[] = []

	for (const key of ['text', 'title', 'caption', 'alt', 'markdown']) {
		const entry = obj[key]
		if (typeof entry === 'string' && entry.trim()) chunks.push(entry.trim())
	}

	for (const key of ['children', 'content', 'nodes', 'items', 'document', 'value', 'data']) {
		const nested = extractPlainText(obj[key], depth + 1)
		if (nested) chunks.push(nested)
	}

	if (chunks.length === 0) {
		for (const [key, entry] of Object.entries(obj)) {
			if (['url', 'href', 'src', 'id', 'type', '__typename'].includes(key)) continue
			const nested = extractPlainText(entry, depth + 1)
			if (nested) chunks.push(nested)
		}
	}

	return chunks.join(' ').replace(/\s+/g, ' ').trim()
}

function collectFiles(
	content?: {
		references?: Array<{
			file?: { url?: string | null; fileName?: string | null; fileType?: string | null } | null
		}> | null
	} | null,
): Array<{ url?: string | null; fileName?: string | null; fileType?: string | null }> {
	if (!content?.references) return []
	const result: Array<{ url?: string | null; fileName?: string | null; fileType?: string | null }> = []
	for (const r of content.references) {
		if (r?.file) result.push(r.file)
	}
	return result
}
