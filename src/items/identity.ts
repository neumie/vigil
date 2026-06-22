import { existsSync } from 'node:fs'
import { computePlanDirName, slugify } from '../util/slug.js'
import type { ItemRecord } from './schema.js'

export interface ItemWorkspaceIdentity {
	baseRef: string
	planDirName: string
	branchName: string
	/** Set only if the recorded worktree still exists on disk. */
	existingWorktreePath: string | undefined
}

function createdAtDate(item: ItemRecord): Date {
	const date = new Date(item.createdAt)
	return Number.isNaN(date.getTime()) ? new Date() : date
}

function itemSuffix(item: ItemRecord): string {
	return slugify(item.id, 8) || 'item'
}

/**
 * Resolve an Item row to its workspace identity. Defaults derive from Item
 * title/id/createdAt and never from legacy Task fields or mutable project config.
 */
export function resolveItemWorkspace(item: ItemRecord): ItemWorkspaceIdentity {
	const suffix = itemSuffix(item)
	return {
		baseRef: item.baseRef,
		planDirName: item.planDirName ?? `${computePlanDirName(item.title, createdAtDate(item))}-${suffix}`,
		branchName: item.branchName ?? `vigil/item/${slugify(item.title) || 'item'}-${suffix}`,
		existingWorktreePath: item.worktreePath && existsSync(item.worktreePath) ? item.worktreePath : undefined,
	}
}
