import { execSync } from 'node:child_process'
import { existsSync, mkdirSync } from 'node:fs'
import { basename, dirname, join } from 'node:path'
import { log } from '../util/logger.js'

export function createWorktree(
	repoPath: string,
	baseBranch: string,
	branchName: string,
	worktreeBaseDir?: string,
): string {
	// Ensure base branch is up to date
	try {
		execSync(`git fetch origin ${baseBranch}`, { cwd: repoPath, stdio: 'pipe' })
	} catch {
		log.warn('worktree', `Could not fetch origin/${baseBranch}, using local`)
	}

	const worktreeDir = worktreeBaseDir ?? join(dirname(repoPath), `${basename(repoPath)}-worktrees`)
	if (!existsSync(worktreeDir)) {
		mkdirSync(worktreeDir, { recursive: true })
	}

	const worktreePath = join(worktreeDir, branchName.replace(/\//g, '-'))

	if (existsSync(worktreePath)) {
		log.warn('worktree', `Worktree path already exists: ${worktreePath}, removing first`)
		try {
			execSync(`git worktree remove "${worktreePath}" --force`, { cwd: repoPath, stdio: 'pipe' })
		} catch {
			// May not be a worktree, just a directory
		}
	}

	execSync(`git worktree add -B "${branchName}" "${worktreePath}" "origin/${baseBranch}"`, {
		cwd: repoPath,
		stdio: 'pipe',
	})

	log.success('worktree', `Created worktree at ${worktreePath} (branch: ${branchName})`)
	return worktreePath
}

export function pushBranch(worktreePath: string, branchName: string): void {
	execSync(`git push -u origin "${branchName}"`, { cwd: worktreePath, stdio: 'pipe' })
	log.success('worktree', `Pushed branch ${branchName}`)
}
