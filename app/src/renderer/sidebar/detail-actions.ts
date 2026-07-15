import type { DashboardAction, DashboardActionId, DashboardItem, ItemStatus } from '../../shared-helm'

export interface LifecycleActionPlan {
	markDone: boolean
	completeInOverflow: boolean
	primary: DashboardAction | null
	rest: DashboardAction[]
}

export interface ManualStatusOption {
	status: Exclude<ItemStatus, 'running'>
	label: string
}

const MANUAL_STATUS_OPTIONS: readonly ManualStatusOption[] = [
	{ status: 'inbox', label: 'Inbox' },
	{ status: 'ready', label: 'Ready' },
	{ status: 'active', label: 'Active' },
	{ status: 'review', label: 'Review' },
	{ status: 'done', label: 'Done' },
	{ status: 'failed', label: 'Failed' },
	{ status: 'cancelled', label: 'Cancelled' },
]

/** Running is run-owned; every other lifecycle state is a deliberate manual override. */
export function manualStatusOptions(status: ItemStatus): readonly ManualStatusOption[] {
	return status === 'running' ? [] : MANUAL_STATUS_OPTIONS
}

export type LifecycleActionIcon = 'close' | 'play' | 'queue' | 'retry' | 'return' | 'stop'

export interface LifecycleActionPresentation {
	label: string
	icon: LifecycleActionIcon
}

/** Make lifecycle actions self-explanatory without adding instructional copy. */
export function lifecycleActionPresentation(
	actionId: DashboardActionId,
	fallbackLabel: string,
	kind: DashboardItem['kind'],
	executionMode: DashboardItem['executionMode'] = kind === 'loop' ? 'loop' : 'solve',
): LifecycleActionPresentation {
	const loop = executionMode === 'loop'
	switch (actionId) {
		case 'approve':
			return { label: 'Approve and queue', icon: 'queue' }
		case 'start':
			return { label: loop ? 'Start loop' : 'Start agent', icon: 'play' }
		case 'retry':
			return { label: loop ? 'Queue loop retry' : 'Queue retry', icon: 'retry' }
		case 'cancel':
			return { label: loop ? 'Cancel loop' : 'Cancel run', icon: 'stop' }
		case 'reject':
			return { label: 'Reject', icon: 'close' }
		case 'reopen':
			return { label: 'Move to review', icon: 'return' }
		default:
			return { label: fallbackLabel, icon: 'play' }
	}
}

/** Review and human-active work share the explicit completion handoff. */
export function lifecycleActionPlan(status: ItemStatus, actions: readonly DashboardAction[]): LifecycleActionPlan {
	if (status === 'review' || status === 'active') {
		return { markDone: true, completeInOverflow: false, primary: null, rest: [...actions] }
	}
	// Destructive actions remain in overflow. A running Item has only Cancel,
	// so its pinned bar becomes a quiet live-state readout instead of a trap.
	const primary =
		actions.find(action => action.tone === 'primary') ?? actions.find(action => action.tone === 'muted') ?? null
	return {
		markDone: false,
		completeInOverflow: status === 'inbox',
		primary: primary ?? null,
		rest: primary ? actions.filter(action => action !== primary) : [...actions],
	}
}

export default { lifecycleActionPlan, lifecycleActionPresentation, manualStatusOptions }
