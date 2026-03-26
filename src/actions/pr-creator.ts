import { execSync } from 'node:child_process'
import { log } from '../util/logger.js'

interface PROptions {
	worktreePath: string
	branchName: string
	baseBranch: string
	title: string
	body: string
	draft: boolean
}

export function createPR(opts: PROptions): string {
	const args = [
		'pr',
		'create',
		'--base',
		opts.baseBranch,
		'--head',
		opts.branchName,
		'--title',
		opts.title,
		'--body',
		opts.body,
	]
	if (opts.draft) args.push('--draft')

	const result = execSync(`gh ${args.map(a => `"${a.replace(/"/g, '\\"')}"`).join(' ')}`, {
		cwd: opts.worktreePath,
		encoding: 'utf-8',
		stdio: ['pipe', 'pipe', 'pipe'],
	}).trim()

	log.success('pr-creator', `Created PR: ${result}`)
	return result
}
