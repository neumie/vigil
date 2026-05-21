import { existsSync } from 'node:fs'
import type { TaskRecord } from '../types.js'
import { computePlanDirName, slugify } from '../util/slug.js'

export interface TaskWorkspaceIdentity {
	planDirName: string
	branchName: string
	/** Set only if the recorded worktree still exists on disk. */
	existingWorktreePath: string | undefined
}

/**
 * Resolve a task ROW to its workspace identity — plan-dir name, branch name, and
 * an existing worktree path (only when it still exists on disk). Defaults are
 * derived from the title; persisting them is the caller's job.
 *
 * This is the DB-identity axis, distinct from {@link PlanWorkspace} (on-disk
 * layout). Both the worker and the `/plan` endpoint resolve identity through
 * here so the two entry points can't drift.
 */
export function resolveTaskWorkspace(task: TaskRecord): TaskWorkspaceIdentity {
	return {
		planDirName: task.planDirName ?? computePlanDirName(task.title),
		branchName: task.branchName ?? `vigil/${slugify(task.title)}`,
		existingWorktreePath: task.worktreePath && existsSync(task.worktreePath) ? task.worktreePath : undefined,
	}
}
