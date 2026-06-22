import type { ProjectConfig, VigilConfig } from '../config.js'
import type { DB } from '../db/client.js'
import type { ItemCommands } from '../items/commands.js'
import type { ItemRecord } from '../items/schema.js'
import type { TaskProvider } from '../providers/provider.js'
import type { SolverResult, TaskRecord } from '../types.js'
import { log } from '../util/logger.js'
import { pushBranch } from '../worktree/manager.js'
import { createPR } from './pr-creator.js'

export interface DispatchPrOptions {
	worktreePath: string
	branchName: string
	baseBranch: string
	title: string
	body: string
	draft: boolean
}

export interface DispatchSideEffects {
	pushBranch(worktreePath: string, branchName: string): void | Promise<void>
	createPr(opts: DispatchPrOptions): string | Promise<string>
}

const DEFAULT_SIDE_EFFECTS: DispatchSideEffects = {
	pushBranch,
	createPr: createPR,
}

function dispatchSideEffects(overrides?: Partial<DispatchSideEffects>): DispatchSideEffects {
	return { ...DEFAULT_SIDE_EFFECTS, ...overrides }
}

export async function dispatch(
	taskId: string,
	result: SolverResult,
	config: VigilConfig,
	db: DB,
	provider: TaskProvider,
	projectConfig: ProjectConfig,
): Promise<void> {
	const task = db.getTask(taskId)
	if (!task) throw new Error(`Task ${taskId} not found`)

	const worktreePath = task.worktreePath ?? ''
	const branchName = task.branchName ?? ''

	// If claude already shipped (created PR via /almanac:ship), just record it.
	if (result.prUrl) {
		log.info('dispatcher', `Claude already shipped PR: ${result.prUrl}`)
		db.updateTask(taskId, { prUrl: result.prUrl, prDraft: 0 })
		db.insertEvent(taskId, 'pr_created', { url: result.prUrl, draft: false, shippedByClaude: true })
		return
	}

	// Agent didn't pre-ship — push the branch and open a PR ourselves.
	await openPrAndRecord({ taskId, db, provider, config, projectConfig, task, worktreePath, branchName, result })
}

export interface DispatchSolveItemArgs {
	itemId: string
	result: SolverResult
	config: VigilConfig
	commands: ItemCommands
	provider: TaskProvider
	sideEffects?: Partial<DispatchSideEffects>
}

export async function dispatchSolveItem(args: DispatchSolveItemArgs): Promise<void> {
	const item = args.commands.getItem(args.itemId)
	if (!item) throw new Error(`Item ${args.itemId} not found`)
	if (item.kind !== 'solve') throw new Error(`Item ${args.itemId} is ${item.kind}, not solve`)

	if (args.result.prUrl) {
		log.info('dispatcher', `Agent already shipped PR: ${args.result.prUrl}`)
		args.commands.recordDispatchPr(args.itemId, { prUrl: args.result.prUrl, shippedByAgent: true })
		args.commands.recordActionCompleted(args.itemId)
		return
	}

	if (!args.config.github.createPrs) {
		args.commands.recordDispatchSkipped(args.itemId, 'github.createPrs disabled')
		args.commands.recordActionCompleted(args.itemId)
		return
	}

	const worktreePath = item.worktreePath
	const branchName = item.branchName
	if (!worktreePath || !branchName) {
		throw new Error(`Item ${args.itemId} is missing worktree or branch for dispatch`)
	}

	const sideEffects = dispatchSideEffects(args.sideEffects)
	await sideEffects.pushBranch(worktreePath, branchName)

	const prUrl = await sideEffects.createPr({
		worktreePath,
		branchName,
		baseBranch: item.baseRef,
		title: `${args.config.github.prPrefix} ${args.result.prTitle ?? item.title}`,
		body: args.result.prBody ?? args.result.summary,
		draft: false,
	})
	args.commands.recordDispatchPr(args.itemId, { prUrl })

	if (shouldPostItemComment(args.config, item, args.provider)) {
		const commentId = await args.provider.postComment(item.source.externalId, `**Vigil**: Solved. PR: ${prUrl}`)
		if (commentId) args.commands.recordDispatchComment(args.itemId, commentId)
	}

	args.commands.recordActionCompleted(args.itemId)
}

interface OpenPrArgs {
	taskId: string
	db: DB
	provider: TaskProvider
	config: VigilConfig
	projectConfig: ProjectConfig
	task: TaskRecord
	worktreePath: string
	branchName: string
	result: SolverResult
}

/** Push the branch, open a PR (if enabled), record it, and post a comment. */
async function openPrAndRecord(a: OpenPrArgs): Promise<void> {
	pushBranch(a.worktreePath, a.branchName)
	if (!a.config.github.createPrs) return

	const prUrl = createPR({
		worktreePath: a.worktreePath,
		branchName: a.branchName,
		baseBranch: a.projectConfig.baseBranch,
		title: `${a.config.github.prPrefix} ${a.result.prTitle ?? a.task.title}`,
		body: a.result.prBody ?? a.result.summary,
		draft: false,
	})
	a.db.updateTask(a.taskId, { prUrl, prDraft: 0 })
	a.db.insertEvent(a.taskId, 'pr_created', { url: prUrl, draft: false })

	if (a.config.github.postComments) {
		await postCommentAndRecord(a.taskId, a.db, a.provider, a.task.externalId, `**Vigil**: Solved. PR: ${prUrl}`)
	}
}

/** Post a comment via the provider and record the comment id on the task. */
async function postCommentAndRecord(
	taskId: string,
	db: DB,
	provider: TaskProvider,
	externalId: string,
	markdown: string,
): Promise<void> {
	const commentId = await provider.postComment(externalId, markdown)
	if (commentId) {
		db.updateTask(taskId, { commentId })
		db.insertEvent(taskId, 'comment_posted', { commentId })
	}
}

function shouldPostItemComment(
	config: VigilConfig,
	item: ItemRecord,
	provider: TaskProvider,
): item is ItemRecord & {
	source: NonNullable<ItemRecord['source']>
} {
	return config.github.postComments && item.source !== null && item.source.provider === provider.name
}
