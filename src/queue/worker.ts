import { dispatch } from '../actions/dispatcher.js'
import type { VigilConfig } from '../config.js'
import type { DB } from '../db/client.js'
import type { TaskProvider } from '../providers/provider.js'
import { invokeClaude } from '../solver/invoker.js'
import { parseClaudeOutput } from '../solver/output-parser.js'
import { buildPrompt } from '../solver/prompt-builder.js'
import { parseResultFile, parseTierFromOutput } from '../solver/result-parser.js'
import { log } from '../util/logger.js'
import { slugify } from '../util/slug.js'
import { createWorktree } from '../worktree/manager.js'

export async function processTask(taskId: string, config: VigilConfig, db: DB, provider: TaskProvider): Promise<void> {
	const task = db.getTask(taskId)
	if (!task) throw new Error(`Task ${taskId} not found in DB`)

	const projectConfig = config.projects.find(p => p.slug === task.projectSlug)
	if (!projectConfig) throw new Error(`No project config for slug: ${task.projectSlug}`)

	db.updateTask(taskId, { status: 'processing', startedAt: new Date().toISOString() })
	db.insertEvent(taskId, 'solver_started')

	try {
		// Phase 1: Fetch full context via provider
		log.info('worker', `Fetching context for task: ${task.title}`)
		const taskContext = await provider.getTaskContext(task.clientcareId)

		if (!taskContext) {
			throw Object.assign(new Error('Task not found in source system'), { phase: 'poll' })
		}

		const prompt = buildPrompt(taskContext)
		db.updateTask(taskId, { taskContext: prompt })

		// Phase 2: Create git worktree
		const branchName = `vigil/${slugify(task.title)}`
		log.info('worker', `Creating worktree for branch: ${branchName}`)
		let worktreePath: string
		try {
			worktreePath = createWorktree(
				projectConfig.repoPath,
				projectConfig.baseBranch,
				branchName,
				projectConfig.worktreeDir,
			)
		} catch (err) {
			throw Object.assign(new Error(`Worktree creation failed: ${err instanceof Error ? err.message : err}`), {
				phase: 'worktree',
			})
		}
		db.updateTask(taskId, { worktreePath, branchName })

		// Phase 3: Invoke Claude Code
		log.info('worker', `Invoking Claude Code in ${worktreePath}`)
		let invokeResult: Awaited<ReturnType<typeof invokeClaude>>
		try {
			invokeResult = await invokeClaude(worktreePath, prompt, config.solver)
		} catch (err) {
			throw Object.assign(new Error(`Claude invocation failed: ${err instanceof Error ? err.message : err}`), {
				phase: 'solve',
			})
		}
		db.updateTask(taskId, {
			claudeExitCode: invokeResult.exitCode,
			claudeRawOutput: invokeResult.stdout,
		})

		// Parse Claude's output into events for the dashboard
		const events = parseClaudeOutput(invokeResult.stdout)
		for (const event of events) {
			db.insertEvent(taskId, `claude_${event.type}`, { detail: event.detail, file: event.file })
		}

		// Phase 4: Parse result
		let solverResult = parseResultFile(worktreePath)
		if (!solverResult) {
			log.warn('worker', 'No .solver-result.json found, trying to parse from output')
			solverResult = parseTierFromOutput(invokeResult.stdout)
		}
		if (!solverResult) {
			throw Object.assign(
				new Error('Could not determine solver result — no .solver-result.json and no tier in output'),
				{ phase: 'solve' },
			)
		}

		db.updateTask(taskId, {
			tier: solverResult.tier,
			solverSummary: solverResult.summary,
			solverConfidence: solverResult.confidence,
			filesChanged: JSON.stringify(solverResult.filesChanged),
			solverRawResult: JSON.stringify(solverResult),
		})
		db.insertEvent(taskId, 'solver_completed', {
			tier: solverResult.tier,
			confidence: solverResult.confidence,
		})

		// Phase 5: Dispatch tier-appropriate action
		log.info('worker', `Task assessed as ${solverResult.tier} (confidence: ${solverResult.confidence})`)
		try {
			await dispatch(taskId, solverResult, config, db, provider, projectConfig)
		} catch (err) {
			throw Object.assign(new Error(`Action dispatch failed: ${err instanceof Error ? err.message : err}`), {
				phase: 'action',
			})
		}

		db.updateTask(taskId, { status: 'completed', completedAt: new Date().toISOString() })
		db.insertEvent(taskId, 'action_completed')
		log.success('worker', `Task completed: ${task.title} [${solverResult.tier}]`)
	} catch (err) {
		const error = err as Error & { phase?: string }
		db.updateTask(taskId, {
			status: 'failed',
			errorMessage: error.message,
			errorPhase: error.phase ?? 'solve',
			completedAt: new Date().toISOString(),
		})
		db.insertEvent(taskId, 'solver_failed', { error: error.message, phase: error.phase })
		log.error('worker', `Task failed: ${task.title}`, err)
	}
}
