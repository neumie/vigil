import { spawn } from 'node:child_process'
import type { VigilConfig } from '../config.js'
import { log } from '../util/logger.js'

export interface InvokeResult {
	exitCode: number | null
	stdout: string
	stderr: string
}

export async function invokeClaude(
	worktreePath: string,
	prompt: string,
	solver: VigilConfig['solver'],
): Promise<InvokeResult> {
	const args: string[] = ['-p', '--output-format', 'json', '--dangerously-skip-permissions']

	if (solver.model) {
		args.push('--model', solver.model)
	}
	if (solver.maxBudgetUsd) {
		args.push('--max-turns', '100')
	}

	log.info('invoker', `Spawning claude in ${worktreePath}`, { model: solver.model ?? 'default' })

	return new Promise<InvokeResult>((resolve, reject) => {
		const child = spawn('claude', args, {
			cwd: worktreePath,
			env: { ...process.env },
			stdio: ['pipe', 'pipe', 'pipe'],
			timeout: solver.timeoutMinutes * 60 * 1000,
		})

		const stdoutChunks: Buffer[] = []
		const stderrChunks: Buffer[] = []

		child.stdout.on('data', (chunk: Buffer) => stdoutChunks.push(chunk))
		child.stderr.on('data', (chunk: Buffer) => stderrChunks.push(chunk))

		// Pipe prompt via stdin
		child.stdin.write(prompt)
		child.stdin.end()

		child.on('close', code => {
			const stdout = Buffer.concat(stdoutChunks).toString('utf-8')
			const stderr = Buffer.concat(stderrChunks).toString('utf-8')

			log.info('invoker', `Claude exited with code ${code}`, {
				stdoutLen: stdout.length,
				stderrLen: stderr.length,
			})

			resolve({ exitCode: code, stdout, stderr })
		})

		child.on('error', err => {
			reject(new Error(`Failed to spawn claude: ${err.message}`))
		})
	})
}
