export type TaskStatus = 'queued' | 'processing' | 'completed' | 'failed' | 'skipped'
export type Tier = 'trivial' | 'simple' | 'complex' | 'unclear'
export type ErrorPhase = 'poll' | 'worktree' | 'solve' | 'action'

export interface TaskRecord {
	id: string
	clientcareId: string
	projectSlug: string
	title: string
	status: TaskStatus
	tier: Tier | null
	taskContext: string | null
	solverSummary: string | null
	solverConfidence: number | null
	filesChanged: string | null
	solverRawResult: string | null
	worktreePath: string | null
	branchName: string | null
	prUrl: string | null
	prDraft: number | null
	commentId: string | null
	queuedAt: string
	startedAt: string | null
	completedAt: string | null
	errorMessage: string | null
	errorPhase: ErrorPhase | null
	claudeExitCode: number | null
	claudeRawOutput: string | null
}

export interface PollState {
	projectSlug: string
	lastPollAt: string
	lastTaskSeen: string | null
}

export interface EventLogEntry {
	id: number
	taskId: string | null
	eventType: string
	payload: string | null
	createdAt: string
}

export interface SolverResult {
	tier: Tier
	confidence: number
	summary: string
	filesChanged: string[]
	analysis?: string
	questionsForRequester?: string[]
	remainingWork?: string[]
	prReady: boolean
	prTitle?: string
	prBody?: string
}

export interface ClaudeEvent {
	type: 'file_read' | 'edit' | 'command' | 'assessment' | 'error' | 'tool_call'
	timestamp?: string
	detail: string
	file?: string
}

export interface QueueStatus {
	pending: number
	active: number
	maxConcurrency: number
	activeTasks: Array<{ taskId: string; title: string; startedAt: string }>
}

export interface ContemberTask {
	id: string
	title: string
	status: string
	priority: string | null
	createdAt: string
	dueDate: string | null
	timeEstimate: number | null
	module: { name: string } | null
	project: {
		id: string
		slug: string
		name: string
		repositoryUrl: string | null
		aiMode: string | null
	} | null
}
