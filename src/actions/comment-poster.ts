import type { GraphQLClient } from '../graphql/client.js'
import { CREATE_COMMENT } from '../graphql/mutations.js'
import { log } from '../util/logger.js'

/**
 * Convert markdown text to SlateJS format for Contember's content field.
 * Mirrors markdownToSlateJS from ClientCare worker/src/agents/tools.ts.
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

		return {
			type: 'paragraph',
			children: paragraphChildren,
		}
	})

	return { children, formatVersion: 2 }
}

export async function postComment(
	graphql: GraphQLClient,
	taskClientcareId: string,
	markdown: string,
	isPublic = false,
): Promise<string | null> {
	const contentData = markdownToSlateJS(markdown)

	const result = await graphql.mutate<{
		createComment: { ok: boolean; node?: { id: string } }
	}>(CREATE_COMMENT, {
		taskId: taskClientcareId,
		contentData,
		isPublic,
	})

	if (result.createComment.ok) {
		const commentId = result.createComment.node?.id ?? null
		log.success('comment', `Posted comment on task ${taskClientcareId}`)
		return commentId
	}

	log.error('comment', `Failed to post comment on task ${taskClientcareId}`)
	return null
}
