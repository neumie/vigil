import type { DashboardItem, DashboardTone } from '../../shared-helm'
import { statusTone } from './model'

export type DetailSection =
	| 'intent'
	| 'queue'
	| 'activity'
	| 'outcome'
	| 'failure'
	| 'log'
	| 'input'
	| 'setup'
	| 'source'
	| 'delivery'

/** One entry in the detail page's flat editorial stack. `open` is the
 *  disclosure's MOUNT-TIME default only (§3.20): it is never re-applied on a
 *  status flip, so a mid-read status change cannot collapse a section the
 *  user opened (or pop one open under their pointer). */
export interface DetailSectionEntry {
	kind: DetailSection
	open?: boolean
}

export type Attention = { tone: 'error' | 'warning' | 'info'; label: string; text: string } | null

function chipTone(item: DashboardItem): DashboardTone {
	switch (statusTone(item.status)) {
		case 'accent':
			return 'blue'
		case 'success':
			return 'green'
		case 'warn':
			return 'amber'
		case 'danger':
			return 'red'
		default:
			return 'gray'
	}
}

function attentionFor(item: DashboardItem, messy: boolean): Attention {
	if (item.status === 'failed' && item.errorMessage) {
		return {
			tone: 'error',
			label: item.errorPhase ? `Failed — ${item.errorPhase}` : 'Failed',
			text: item.errorMessage,
		}
	}
	if (item.status === 'review' && messy) {
		return {
			tone: 'warning',
			label: 'Verify before marking done',
			text: 'The run did not finish cleanly, but work may be on the branch or pull request.',
		}
	}
	if (item.assessment?.verdict === 'security' && item.assessment.securityNote) {
		return { tone: 'warning', label: 'Security review', text: item.assessment.securityNote }
	}
	return null
}

const sections = (...kinds: Array<DetailSection | DetailSectionEntry>): DetailSectionEntry[] =>
	kinds.map(kind => (typeof kind === 'string' ? { kind } : kind))

/** Presentation only: lifecycle permissions remain in `allowedActions`.
 *  Sections order the one flat stack per state (decision content first); each
 *  section component self-gates on its data and renders null when empty. */
export function detailState(item: DashboardItem): {
	chipTone: DashboardTone
	attention: Attention
	sections: DetailSectionEntry[]
} {
	const messy = item.runOutcome === 'errored' || item.runOutcome === 'no_result'
	const attention = attentionFor(item, messy)
	switch (item.status) {
		case 'inbox':
			// Run-evidence sections trail every pre-run state: they self-gate to
			// nothing on a pristine item, but an item moved BACK here after a run
			// (manual status, Return to Queue) must not lose its history.
			return {
				chipTone: chipTone(item),
				attention,
				sections: sections('intent', 'source', 'setup', 'activity', 'log', 'input'),
			}
		case 'ready':
			return {
				chipTone: chipTone(item),
				attention,
				sections: sections('queue', 'setup', 'source', 'activity', 'log', 'input'),
			}
		case 'active':
			return {
				chipTone: chipTone(item),
				attention,
				sections: item.planStatus
					? sections('setup', 'source', 'activity', 'log', 'input')
					: sections('source', 'activity', 'log', 'input'),
			}
		case 'running':
			return {
				chipTone: chipTone(item),
				attention,
				sections: sections('activity', 'log', 'input', 'source'),
			}
		case 'review':
			return {
				chipTone: chipTone(item),
				attention,
				sections: sections('outcome', 'delivery', 'activity', 'log', 'input', 'source'),
			}
		case 'failed':
			return {
				chipTone: chipTone(item),
				attention,
				// The log is the diagnostic — open, directly beneath the failure text.
				sections: sections('failure', { kind: 'log', open: true }, 'activity', 'outcome', 'setup', 'input', 'source'),
			}
		case 'done':
			return {
				chipTone: chipTone(item),
				attention,
				sections: sections('outcome', 'delivery', 'activity', 'log', 'input', 'source'),
			}
		case 'cancelled':
			// Outcome/input stay reachable: a cancelled run may hold a partial
			// result, a branch, and the solve input worth reviewing before retry.
			return {
				chipTone: chipTone(item),
				attention: null,
				sections: sections('failure', 'outcome', 'activity', 'log', 'input', 'source'),
			}
		default:
			throw new Error(`Unsupported item status: ${item.status}`)
	}
}

export default { detailState }
