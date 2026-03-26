import { log } from '../util/logger.js'
import type { DiscoveredTask, TaskContext, TaskProvider } from './provider.js'

// -- GraphQL queries/mutations --

const LIST_NEW_TASKS = `
query ListNewTasks($projectSlug: String!, $createdAfter: DateTime!) {
  listTask(
    filter: {
      project: { slug: { eq: $projectSlug } }
      createdAt: { gte: $createdAfter }
      archivedAt: { isNull: true }
    }
    orderBy: [{ createdAt: asc }]
    limit: 50
  ) {
    id
    title
    status
    priority
    createdAt
    dueDate
    timeEstimate
    module { name }
    project { id slug name repositoryUrl aiMode }
  }
}
`

const GET_TASK_CONTEXT = `
query GetTaskContext($taskId: String!) {
  getTask(by: { id: $taskId }) {
    id
    title
    status
    priority
    dueDate
    timeEstimate
    module { name }
    description {
      data
      references { file { url fileName fileType } }
    }
    comments(
      filter: { deletedAt: { isNull: true } }
      orderBy: [{ createdAt: asc }]
    ) {
      id
      createdAt
      sourceType
      isPublic
      content { data }
      person { tenantPerson { name email } }
    }
    project {
      id name slug repositoryUrl aiMode
      description { data }
      contexts(orderBy: [{ updatedAt: desc }]) { title markdown }
    }
  }
}
`

const CREATE_COMMENT = `
mutation CreateComment($taskId: String!, $contentData: Json!, $isPublic: Boolean!) {
  createComment(data: {
    task: { connect: { id: $taskId } }
    isPublic: $isPublic
    sourceType: ai_generated
    content: { create: { data: $contentData } }
  }) {
    ok
    node { id }
  }
}
`

// -- Config --

export interface ContemberProviderConfig {
	type: 'contember'
	apiBaseUrl: string
	projectSlug: string
	apiToken: string
}

// -- Provider --

export class ContemberProvider implements TaskProvider {
	readonly name = 'Contember'
	private url: string
	private token: string

	constructor(config: ContemberProviderConfig) {
		this.url = `${config.apiBaseUrl}/content/${config.projectSlug}/live`
		this.token = config.apiToken
	}

	async pollNewTasks(projectSlug: string, since: string): Promise<DiscoveredTask[]> {
		const data = await this.query<{ listTask: RawTask[] }>(LIST_NEW_TASKS, {
			projectSlug,
			createdAfter: since,
		})

		return data.listTask.map(t => ({
			externalId: t.id,
			title: t.title,
			createdAt: t.createdAt,
			projectSlug,
		}))
	}

	async getTaskContext(externalId: string): Promise<TaskContext | null> {
		const data = await this.query<{ getTask: RawTaskFull | null }>(GET_TASK_CONTEXT, {
			taskId: externalId,
		})

		const t = data.getTask
		if (!t) return null

		const comments =
			t.comments?.map(c => ({
				author: c.person?.tenantPerson?.name ?? c.person?.tenantPerson?.email ?? 'Unknown',
				createdAt: c.createdAt ?? '',
				body: c.content?.data ? extractPlainText(c.content.data) : '',
				visibility: (c.isPublic ? 'public' : 'internal') as 'public' | 'internal',
			})) ?? []

		const attachments: TaskContext['attachments'] = []
		if (t.description?.references) {
			for (const ref of t.description.references) {
				if (ref?.file?.url) {
					attachments.push({
						name: ref.file.fileName ?? 'file',
						url: ref.file.url,
						type: ref.file.fileType ?? undefined,
					})
				}
			}
		}

		return {
			title: t.title ?? '',
			status: t.status ?? undefined,
			priority: t.priority ?? undefined,
			dueDate: t.dueDate ?? undefined,
			timeEstimate: t.timeEstimate ?? undefined,
			module: t.module?.name ?? undefined,
			description: t.description?.data ? extractPlainText(t.description.data) : undefined,
			attachments: attachments.length > 0 ? attachments : undefined,
			comments: comments.length > 0 ? comments : undefined,
			project: t.project
				? {
						name: t.project.name ?? '',
						slug: t.project.slug ?? '',
						description: t.project.description?.data ? extractPlainText(t.project.description.data) : undefined,
						contextDocs: t.project.contexts
							?.filter(c => c.markdown)
							.map(c => ({
								title: c.title ?? 'Untitled',
								body: (c.markdown?.slice(0, 3000) ?? '') + (c.markdown && c.markdown.length > 3000 ? '...' : ''),
							})),
					}
				: undefined,
		}
	}

	async postComment(externalId: string, markdown: string): Promise<string | null> {
		const contentData = markdownToSlateJS(markdown)

		const result = await this.query<{
			createComment: { ok: boolean; node?: { id: string } }
		}>(CREATE_COMMENT, {
			taskId: externalId,
			contentData,
			isPublic: false,
		})

		if (result.createComment.ok) {
			const commentId = result.createComment.node?.id ?? null
			log.success('contember', `Posted comment on task ${externalId}`)
			return commentId
		}

		log.error('contember', `Failed to post comment on task ${externalId}`)
		return null
	}

	// -- Internal GraphQL --

	private async query<T>(query: string, variables?: Record<string, unknown>): Promise<T> {
		const res = await fetch(this.url, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				Authorization: `Bearer ${this.token}`,
			},
			body: JSON.stringify({ query, variables }),
		})

		if (!res.ok) {
			const text = await res.text()
			throw new Error(`GraphQL request failed (${res.status}): ${text}`)
		}

		const json = (await res.json()) as { data?: T; errors?: Array<{ message: string }> }

		if (json.errors?.length) {
			throw new Error(`GraphQL errors: ${json.errors.map(e => e.message).join(', ')}`)
		}

		return json.data as T
	}
}

// -- Raw Contember types --

interface RawTask {
	id: string
	title: string
	status: string
	priority: string | null
	createdAt: string
}

interface RawTaskFull {
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

// -- SlateJS utilities --

/**
 * Extract plain text from SlateJS JSON data.
 */
function extractPlainText(value: unknown, depth = 0): string {
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

/**
 * Convert markdown to SlateJS format for Contember's content field.
 */
function markdownToSlateJS(markdown: string): { children: unknown[]; formatVersion: number } {
	const paragraphs = markdown.split(/\n\s*\n/).filter(p => p.trim().length > 0)

	const children = paragraphs.map(paragraph => {
		const paragraphChildren: unknown[] = []
		const linkRegex = /\[([^\]]+)\]\(([^)]+)\)/g
		let lastIndex = 0
		let match: RegExpExecArray | null = linkRegex.exec(paragraph)

		while (match !== null) {
			if (match.index > lastIndex) {
				const textBefore = paragraph.substring(lastIndex, match.index)
				if (textBefore) paragraphChildren.push({ text: textBefore })
			}
			paragraphChildren.push({
				href: match[2],
				type: 'anchor',
				children: [{ text: match[1] }],
			})
			lastIndex = match.index + match[0].length
			match = linkRegex.exec(paragraph)
		}

		if (lastIndex < paragraph.length) {
			const textAfter = paragraph.substring(lastIndex)
			if (textAfter) paragraphChildren.push({ text: textAfter })
		}

		if (paragraphChildren.length === 0) {
			paragraphChildren.push({ text: paragraph })
		}

		return { type: 'paragraph', children: paragraphChildren }
	})

	return { children, formatVersion: 2 }
}
