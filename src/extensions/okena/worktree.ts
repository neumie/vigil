import { execFileSync } from 'node:child_process'
import { phaseError } from '../../util/errors.js'
import { log } from '../../util/logger.js'
import { excludeVigilFiles, resolveWorktreeStartPoint } from '../../worktree/manager.js'
import type { OkenaClient } from './client.js'

interface CreateWorktreeResponse {
	project_id: string
	terminal_id: string | null
	path: string
}

export interface EnsuredOkenaWorktree {
	worktreePath: string
	wtProjectId: string
	/** A terminal created as a side effect of worktree creation, if any. */
	autoTerminalId: string | null
}

export class OkenaWorktreeManager {
	constructor(private readonly client: OkenaClient) {}

	async createTerminal(projectId: string): Promise<string | null> {
		try {
			const result = await this.client.action<{ terminal_ids?: string[] }>({
				action: 'create_terminal',
				project_id: projectId,
			})
			return result.terminal_ids?.[0] ?? null
		} catch {
			return null
		}
	}

	/**
	 * Resolve the Okena worktree PROJECT (create, reuse-by-branch-name, or reuse
	 * by explicit path). Does NOT decide terminal policy — callers create/find
	 * the terminal they need.
	 */
	async ensureWorktreeProject(
		repoPath: string,
		baseBranch: string,
		branchName: string,
		existingWorktreePath: string | undefined,
	): Promise<EnsuredOkenaWorktree> {
		if (existingWorktreePath) {
			const { state } = await this.findOkenaProject(repoPath)
			const wtProject = state.projects.find(p => p.path === existingWorktreePath)
			if (!wtProject) {
				throw phaseError('worktree', `Okena project not found for worktree path: ${existingWorktreePath}`)
			}
			excludeVigilFiles(existingWorktreePath)
			return { worktreePath: existingWorktreePath, wtProjectId: wtProject.id, autoTerminalId: null }
		}

		const { state, okenaProject } = await this.findOkenaProject(repoPath)
		log.info('okena', `Matched Okena project: ${okenaProject.name} (${okenaProject.id})`)
		await this.ensureBaseBranchReady(repoPath, baseBranch)

		const safeBranch = branchName.replace(/\//g, '-')
		const existing = state.projects.find(p => p.name === branchName && p.path.includes(safeBranch))
		if (existing) {
			log.info('okena', `Reusing existing worktree project: ${existing.id}`)
			excludeVigilFiles(existing.path)
			return { worktreePath: existing.path, wtProjectId: existing.id, autoTerminalId: null }
		}

		log.info('okena', `Creating worktree for branch: ${branchName}`)
		let wt: CreateWorktreeResponse
		try {
			wt = await this.client.action<CreateWorktreeResponse>({
				action: 'create_worktree',
				project_id: okenaProject.id,
				branch: branchName,
				create_branch: true,
			})
		} catch (firstErr) {
			log.warn('okena', `create_branch=true failed: ${firstErr instanceof Error ? firstErr.message : firstErr}`)
			try {
				log.info('okena', 'Branch already exists, reusing')
				wt = await this.client.action<CreateWorktreeResponse>({
					action: 'create_worktree',
					project_id: okenaProject.id,
					branch: branchName,
					create_branch: false,
				})
			} catch (err) {
				throw phaseError('worktree', `Okena worktree creation failed: ${err instanceof Error ? err.message : err}`)
			}
		}

		const worktreePath = wt.path
		const wtProjectId =
			wt.project_id ??
			state.projects.find(p => p.path === worktreePath)?.id ??
			(await this.client.getState()).projects.find(p => p.path === worktreePath)?.id
		if (!wtProjectId) throw phaseError('worktree', 'Worktree project ID could not be resolved')

		log.success('okena', `Worktree at ${worktreePath}`)
		excludeVigilFiles(worktreePath)
		return { worktreePath, wtProjectId, autoTerminalId: wt.terminal_id }
	}

	async findPlanTerminal(wtProjectId: string): Promise<string | null> {
		const state = await this.client.getState()
		const wtProject = state.projects.find(p => p.id === wtProjectId)
		const entry = Object.entries(wtProject?.terminal_names ?? {}).find(([, name]) => name.startsWith('plan: '))
		return entry?.[0] ?? null
	}

	private async findOkenaProject(repoPath: string) {
		const state = await this.client.getState()
		const okenaProject = state.projects.find(p => p.path === repoPath)
		if (!okenaProject) {
			throw phaseError('worktree', `Project not found in Okena for path: ${repoPath}`)
		}
		return { state, okenaProject }
	}

	private async ensureBaseBranchReady(repoPath: string, baseBranch: string): Promise<void> {
		const startPoint = resolveWorktreeStartPoint(repoPath, baseBranch)
		try {
			execFileSync('git', ['checkout', '--detach', startPoint], { cwd: repoPath, stdio: 'pipe', timeout: 10_000 })
		} catch (err) {
			log.warn('okena', `Could not checkout ${startPoint}: ${err instanceof Error ? err.message : err}`)
		}
	}
}
