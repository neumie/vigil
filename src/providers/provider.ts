/**
 * A discovered task from the external source.
 * Minimal info needed to decide whether to enqueue it.
 */
export interface DiscoveredTask {
	externalId: string
	title: string
	createdAt: string
}

/**
 * Vigil's canonical internal representation of a task.
 * Each provider normalizes its native data into this shape.
 * All fields optional except title — providers fill in what they can.
 */
export interface TaskContext {
	title: string
	description?: string
	metadata?: Record<string, string>
	comments?: Array<{ author: string; createdAt: string; body: string }>
	attachments?: Array<{ name: string; url: string }>
	projectContext?: string
}

/**
 * Abstract interface that all task sources must implement.
 */
export interface TaskProvider {
	readonly name: string
	pollNewTasks(projectSlug: string, since: string): Promise<DiscoveredTask[]>
	getTaskContext(externalId: string): Promise<TaskContext | null>
	postComment(externalId: string, markdown: string): Promise<string | null>
}
