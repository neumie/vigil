import { log } from '../util/logger.js'
import { createWorktree } from '../worktree/manager.js'
import { invokeClaude } from './invoker.js'
import type { SolveParams, SolveResult, Solver } from './solver.js'

export class DefaultSolver implements Solver {
	async solve(params: SolveParams): Promise<SolveResult> {
		const { projectConfig, branchName, prompt, solverConfig } = params

		// Create git worktree
		log.info('solver', `Creating worktree for branch: ${branchName}`)
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

		// Invoke Claude Code
		log.info('solver', `Invoking Claude Code in ${worktreePath}`)
		let invokeResult
		try {
			invokeResult = await invokeClaude(worktreePath, prompt, solverConfig)
		} catch (err) {
			throw Object.assign(new Error(`Claude invocation failed: ${err instanceof Error ? err.message : err}`), {
				phase: 'solve',
			})
		}

		return { worktreePath, branchName, invokeResult }
	}
}
