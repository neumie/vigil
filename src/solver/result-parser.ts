import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { log } from '../util/logger.js'
import { type SolverResult, solverResultSchema } from './result-schema.js'

export function parseResultFile(worktreePath: string, planDirName: string): SolverResult | null {
	const resultPath = join(worktreePath, 'docs', 'plans', planDirName, 'solver-result.json')
	try {
		const raw = readFileSync(resultPath, 'utf-8')
		return solverResultSchema.parse(JSON.parse(raw))
	} catch (err) {
		log.warn('result-parser', `Could not read ${resultPath}`, err)
		return null
	}
}
