import { execSync } from 'node:child_process'
import { existsSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { VigilConfig } from '../../config.js'
import { log } from '../../util/logger.js'
import type { SolveParams, SolveResult, Solver } from '../../solver/solver.js'
import { excludeVigilFiles } from '../../worktree/manager.js'
import { OkenaClient } from './client.js'

interface CreateWorktreeResponse {
	project_id: string
	terminal_id: string | null
	path: string
}

export class OkenaSolver implements Solver {
	private client: OkenaClient
	private config: VigilConfig

	constructor(client: OkenaClient, config: VigilConfig) {
		this.client = client
		this.config = config
	}

	async solve(params: SolveParams): Promise<SolveResult> {
		const { projectConfig, branchName, prompt, taskTitle, solverConfig, signal, outputLogPath } = params

		if (signal?.aborted) {
			throw Object.assign(new Error('Task cancelled'), { name: 'AbortError' })
		}

		// Find the Okena project matching this repo
		const state = await this.client.getState()
		const okenaProject = state.projects.find(p => p.path === projectConfig.repoPath)
		if (!okenaProject) {
			throw Object.assign(
				new Error(`Project not found in Okena for path: ${projectConfig.repoPath}`),
				{ phase: 'worktree' },
			)
		}

		// Ensure main repo is on base branch (previous failed attempts may have left it on a vigil branch)
		try {
			execSync(`git checkout "${projectConfig.baseBranch}"`, { cwd: projectConfig.repoPath, stdio: 'pipe' })
		} catch {
			// Non-critical — may already be on the right branch
		}

		// Check if a worktree project already exists in Okena from a previous attempt
		const safeBranch = branchName.replace(/\//g, '-')
		const existingWorktree = state.projects.find(
			p => p.name === branchName && p.path.includes(safeBranch),
		)

		let worktreePath: string
		let terminalId: string | null

		if (existingWorktree) {
			// Reuse existing worktree — just need a terminal
			log.info('okena', `Reusing existing worktree project: ${existingWorktree.id}`)
			worktreePath = existingWorktree.path
			// Create a fresh terminal in the existing project
			try {
				const result = await this.client.action<{ terminal_ids?: string[] }>({
					action: 'create_terminal',
					project_id: existingWorktree.id,
				})
				terminalId = result.terminal_ids?.[0] ?? null
			} catch {
				terminalId = null
			}

			if (!terminalId) {
				throw Object.assign(new Error('Failed to create terminal in existing worktree'), { phase: 'worktree' })
			}
		} else {
			// Create new worktree via Okena
			log.info('okena', `Creating worktree for branch: ${branchName}`)
			let wt: CreateWorktreeResponse
			try {
				wt = await this.client.action<CreateWorktreeResponse>({
					action: 'create_worktree',
					project_id: okenaProject.id,
					branch: branchName,
					create_branch: true,
				})
			} catch {
				try {
					log.info('okena', 'Branch already exists, reusing')
					wt = await this.client.action<CreateWorktreeResponse>({
						action: 'create_worktree',
						project_id: okenaProject.id,
						branch: branchName,
						create_branch: false,
					})
				} catch (err) {
					throw Object.assign(
						new Error(`Okena worktree creation failed: ${err instanceof Error ? err.message : err}`),
						{ phase: 'worktree' },
					)
				}
			}

			worktreePath = wt.path
		}

		// Always create a fresh terminal — the initial one may have hooks running in it
		const wtProjectId = existingWorktree?.id
			?? state.projects.find(p => p.path === worktreePath)?.id
			// Re-fetch state to find the newly created worktree project
			?? (await this.client.getState()).projects.find(p => p.path === worktreePath)?.id

		if (!wtProjectId) {
			throw Object.assign(new Error('Could not find worktree project in Okena'), { phase: 'worktree' })
		}

		try {
			const result = await this.client.action<{ terminal_ids?: string[] }>({
				action: 'split_terminal',
				project_id: wtProjectId,
				path: [],
				direction: 'horizontal',
			})
			terminalId = result.terminal_ids?.[0] ?? null
		} catch {
			// Fallback to create_terminal if split fails
			try {
				const result = await this.client.action<{ terminal_ids?: string[] }>({
					action: 'create_terminal',
					project_id: wtProjectId,
				})
				terminalId = result.terminal_ids?.[0] ?? null
			} catch {
				terminalId = null
			}
		}

		if (!terminalId) {
			throw Object.assign(new Error('Failed to create terminal in worktree project'), { phase: 'worktree' })
		}

		log.success('okena', `Worktree at ${worktreePath} (terminal: ${terminalId})`)
		excludeVigilFiles(worktreePath)

		// Rename terminal with task title
		try {
			await this.client.action({
				action: 'rename_terminal',
				project_id: wtProjectId,
				terminal_id: terminalId,
				name: taskTitle,
			})
		} catch {
			// Non-critical
		}

		// Write prompt to file in worktree
		const promptFile = join(worktreePath, '.vigil-prompt.txt')
		const exitCodeFile = join(worktreePath, '.vigil-exit-code')
		writeFileSync(promptFile, prompt, 'utf-8')

		// Run claude interactively — pass prompt as positional arg via command substitution
		// Vigil reads .solver-result.json from worktree for results
		const args = ['claude', '--dangerously-skip-permissions']
		if (solverConfig.model) {
			args.push('--model', solverConfig.model)
		}
		const command = `${args.join(' ')} "$(cat .vigil-prompt.txt)"; echo $? > .vigil-exit-code`

		// Run command in Okena terminal
		log.info('okena', `Running claude in terminal ${terminalId}`)
		try {
			await this.client.action({
				action: 'run_command',
				terminal_id: terminalId,
				command,
			})
		} catch (err) {
			throw Object.assign(
				new Error(`Failed to run command in Okena terminal: ${err instanceof Error ? err.message : err}`),
				{ phase: 'solve' },
			)
		}

		// Poll for completion
		const timeoutMs = solverConfig.timeoutMinutes * 60 * 1000
		const startTime = Date.now()

		log.info('okena', `Waiting for claude to finish (timeout: ${solverConfig.timeoutMinutes}m)`)
		while (!existsSync(exitCodeFile)) {
			if (signal?.aborted) {
				// Send Ctrl+C to the terminal to kill claude
				try {
					await this.client.action({ action: 'send_special_key', terminal_id: terminalId, key: 'ctrl_c' })
				} catch { /* best effort */ }
				throw Object.assign(new Error('Task cancelled'), { name: 'AbortError' })
			}
			if (Date.now() - startTime > timeoutMs) {
				throw Object.assign(new Error('Claude timed out in Okena terminal'), { phase: 'solve' })
			}
			await sleep(2000)
		}

		// Small delay to ensure file is fully written
		await sleep(500)

		// Read results
		const exitCode = Number.parseInt(readFileSync(exitCodeFile, 'utf-8').trim(), 10)

		log.info('okena', `Claude exited with code ${exitCode}`)

		// Exit code 130 = SIGINT (Ctrl+C in terminal) — treat as user cancellation
		if (exitCode === 130) {
			throw Object.assign(new Error('Task cancelled (Ctrl+C in terminal)'), { name: 'AbortError' })
		}

		// Cleanup temp files
		for (const f of [promptFile, exitCodeFile]) {
			try {
				if (existsSync(f)) unlinkSync(f)
			} catch {
				// Non-critical
			}
		}

		return {
			worktreePath,
			branchName,
			invokeResult: { exitCode, stdout: '', stderr: '' },
		}
	}
}

function sleep(ms: number): Promise<void> {
	return new Promise(resolve => setTimeout(resolve, ms))
}

export async function createOkenaSolver(config: VigilConfig): Promise<Solver> {
	const client = new OkenaClient()
	if (!(await client.isAvailable())) {
		throw new Error('Okena is not available')
	}
	return new OkenaSolver(client, config)
}
