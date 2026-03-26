/**
 * A discovered task from the external source.
 * Minimal info needed to decide whether to enqueue it.
 */
export interface DiscoveredTask {
	/** Unique ID in the source system */
	externalId: string
	title: string
	createdAt: string
	projectSlug: string
}

/**
 * Full task context used to build the Claude Code prompt.
 * Provider-agnostic — each provider maps its native format to this.
 */
export interface TaskContext {
	title: string
	status?: string
	priority?: string
	dueDate?: string
	timeEstimate?: number
	module?: string
	description?: string
	attachments?: Array<{ name: string; url: string; type?: string }>
	comments?: Array<{
		author: string
		createdAt: string
		body: string
		visibility?: 'public' | 'internal'
	}>
	project?: {
		name: string
		slug: string
		description?: string
		contextDocs?: Array<{ title: string; body: string }>
	}
}

/**
 * Abstract interface that all task sources must implement.
 *
 * Vigil's core (poller, worker, dispatcher) only depends on this interface.
 * Each source (Contember, GitHub Issues, Linear, etc.) provides a concrete implementation.
 */
export interface TaskProvider {
	/** Human-readable name for logs/dashboard, e.g. "Contember", "GitHub Issues" */
	readonly name: string

	/**
	 * Poll for tasks created after `since` in the given project.
	 * Returns only new/relevant tasks — the provider decides what "new" means.
	 */
	pollNewTasks(projectSlug: string, since: string): Promise<DiscoveredTask[]>

	/**
	 * Fetch full context for a single task.
	 * The returned TaskContext is provider-agnostic and used to build the Claude prompt.
	 */
	getTaskContext(externalId: string): Promise<TaskContext | null>

	/**
	 * Post a markdown comment/note back to the task in the source system.
	 * Returns the comment ID if the source supports it, null otherwise.
	 */
	postComment(externalId: string, markdown: string): Promise<string | null>

	/**
	 * Optionally update the task's status in the source system.
	 * Not all providers support this — the default is a no-op.
	 */
	updateStatus?(externalId: string, status: string): Promise<void>
}
