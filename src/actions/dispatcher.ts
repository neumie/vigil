import type { ProjectConfig, VigilConfig } from '../config.js'
import type { DB } from '../db/client.js'
import type { GraphQLClient } from '../graphql/client.js'
import type { SolverResult } from '../types.js'
import { log } from '../util/logger.js'
import { pushBranch } from '../worktree/manager.js'
import { postComment } from './comment-poster.js'
import { createPR } from './pr-creator.js'

export async function dispatch(
	taskId: string,
	result: SolverResult,
	config: VigilConfig,
	db: DB,
	graphql: GraphQLClient,
	projectConfig: ProjectConfig,
): Promise<void> {
	const task = db.getTask(taskId)
	if (!task) throw new Error(`Task ${taskId} not found`)

	const worktreePath = task.worktreePath ?? ''
	const branchName = task.branchName ?? ''

	switch (result.tier) {
		case 'trivial': {
			pushBranch(worktreePath, branchName)
			if (config.github.createPrs) {
				const prUrl = createPR({
					worktreePath,
					branchName,
					baseBranch: projectConfig.baseBranch,
					title: `${config.github.prPrefix} ${result.prTitle ?? task.title}`,
					body: result.prBody ?? result.summary,
					draft: false,
				})
				db.updateTask(taskId, { prUrl, prDraft: 0 })
				db.insertEvent(taskId, 'pr_created', { url: prUrl, draft: false })

				const commentMd = `**Vigil**: Solved (trivial). PR: ${prUrl}`
				const commentId = await postComment(graphql, task.clientcareId, commentMd)
				if (commentId) {
					db.updateTask(taskId, { commentId })
					db.insertEvent(taskId, 'comment_posted', { commentId })
				}
			}
			break
		}

		case 'simple': {
			pushBranch(worktreePath, branchName)
			if (config.github.createPrs) {
				const prUrl = createPR({
					worktreePath,
					branchName,
					baseBranch: projectConfig.baseBranch,
					title: `${config.github.prPrefix} ${result.prTitle ?? task.title}`,
					body: result.prBody ?? result.summary,
					draft: true,
				})
				db.updateTask(taskId, { prUrl, prDraft: 1 })
				db.insertEvent(taskId, 'pr_created', { url: prUrl, draft: true })

				const commentMd = `**Vigil**: Solved (draft PR for review). PR: ${prUrl}`
				const commentId = await postComment(graphql, task.clientcareId, commentMd)
				if (commentId) {
					db.updateTask(taskId, { commentId })
					db.insertEvent(taskId, 'comment_posted', { commentId })
				}
			}
			break
		}

		case 'complex': {
			pushBranch(worktreePath, branchName)

			let commentMd = `**Vigil**: Partial solution on branch \`${branchName}\`.\n\n`
			commentMd += `**Summary**: ${result.summary}\n\n`
			if (result.analysis) commentMd += `**Analysis**:\n${result.analysis}\n\n`
			if (result.remainingWork?.length) {
				commentMd += '**Remaining work**:\n'
				for (const item of result.remainingWork) commentMd += `- ${item}\n`
			}

			const commentId = await postComment(graphql, task.clientcareId, commentMd)
			if (commentId) {
				db.updateTask(taskId, { commentId })
				db.insertEvent(taskId, 'comment_posted', { commentId })
			}
			break
		}

		case 'unclear': {
			let commentMd = '**Vigil**: Cannot proceed — task needs clarification.\n\n'
			if (result.analysis) commentMd += `**Analysis**:\n${result.analysis}\n\n`
			if (result.questionsForRequester?.length) {
				commentMd += '**Questions**:\n'
				for (const q of result.questionsForRequester) commentMd += `- ${q}\n`
			}

			const commentId = await postComment(graphql, task.clientcareId, commentMd)
			if (commentId) {
				db.updateTask(taskId, { commentId })
				db.insertEvent(taskId, 'comment_posted', { commentId })
			}
			break
		}

		default:
			log.warn('dispatcher', `Unknown tier: ${result.tier}`)
	}
}
