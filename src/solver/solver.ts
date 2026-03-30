import type { ProjectConfig, VigilConfig } from '../config.js'
import type { InvokeResult } from './invoker.js'

export interface SolveParams {
	projectConfig: ProjectConfig
	branchName: string
	prompt: string
	taskTitle: string
	solverConfig: VigilConfig['solver']
}

export interface SolveResult {
	worktreePath: string
	branchName: string
	invokeResult: InvokeResult
}

export interface Solver {
	solve(params: SolveParams): Promise<SolveResult>
}
