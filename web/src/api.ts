const BASE = '/api'

async function fetchJSON<T>(path: string): Promise<T> {
	const res = await fetch(`${BASE}${path}`)
	if (!res.ok) throw new Error(`API error: ${res.status}`)
	const json = await res.json()
	return json.data
}

async function postJSON<T>(path: string): Promise<T> {
	const res = await fetch(`${BASE}${path}`, { method: 'POST' })
	if (!res.ok) throw new Error(`API error: ${res.status}`)
	const json = await res.json()
	return json.data
}

export interface TaskRecord {
	id: string
	clientcareId: string
	projectSlug: string
	title: string
	status: string
	tier: string | null
	solverSummary: string | null
	solverConfidence: number | null
	filesChanged: string | null
	worktreePath: string | null
	branchName: string | null
	prUrl: string | null
	prDraft: number | null
	queuedAt: string
	startedAt: string | null
	completedAt: string | null
	errorMessage: string | null
	errorPhase: string | null
}

export interface EventEntry {
	id: number
	taskId: string | null
	eventType: string
	payload: string | null
	createdAt: string
}

export interface QueueStatus {
	pending: number
	active: number
	maxConcurrency: number
	activeTasks: Array<{ taskId: string; title: string; startedAt: string }>
}

export interface DaemonStatus {
	uptime: number
	queue: QueueStatus
	projects: string[]
	pollInterval: number
}

export interface AppConfig {
	taskBaseUrl?: string
}

export const api = {
	config: () => fetchJSON<AppConfig>('/config'),
	status: () => fetchJSON<DaemonStatus>('/status'),
	tasks: (params?: string) => fetchJSON<TaskRecord[]>(`/tasks${params ? `?${params}` : ''}`),
	task: (id: string) => fetchJSON<TaskRecord>(`/tasks/${id}`),
	taskEvents: (id: string) => fetchJSON<EventEntry[]>(`/tasks/${id}/events`),
	queue: () => fetchJSON<QueueStatus>('/queue'),
	stats: () => fetchJSON<Record<string, number>>('/stats'),
	retry: (id: string) => postJSON<{ message: string }>(`/tasks/${id}/retry`),
	triggerPoll: () => postJSON<{ message: string }>('/poll/trigger'),
}
