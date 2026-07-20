// Inline disclosure (§3.20): the quiet show/hide toggle for heavy in-place
// evidence (log, solve input, run setup pickers). Content SNAPS open — never
// height-animated — and renders only while open; `defaultOpen` applies at
// mount only (detail-state's failed-state log).
import type { Meta, StoryObj } from '@storybook/react-vite'
import { Card, Disclosure } from './ui'

const meta: Meta = {
	title: 'Sidebar/Disclosure',
	decorators: [
		story => (
			<div className="page-scroll" style={{ width: 340, overflow: 'visible' }}>
				{story()}
			</div>
		),
	],
}

export default meta
type Story = StoryObj

const LOG = `[12:01:12] worktree ready at ../helm-item-fix-login
[12:01:14] agent started (claude, worktree)
[12:03:02] edited src/auth/login.ts
[12:04:40] tests: 12 passed
[12:05:19] solver-result.json written`

/** Closed at rest: the verb-first cue is the only footprint — a collapsed
 *  well contributes zero DOM. */
export const Closed: Story = {
	render: () => (
		<Card label="Log">
			<Disclosure label="Show log" hideLabel="Hide log">
				<section className="log-well">{LOG}</section>
			</Disclosure>
		</Card>
	),
}

/** Open (also the `defaultOpen` mount state — the failed-state log): the cue
 *  flips to its hide verb and the well snaps into the group's flow. */
export const Open: Story = {
	render: () => (
		<Card label="Log">
			<Disclosure label="Show log" hideLabel="Hide log" defaultOpen>
				<section className="log-well">{LOG}</section>
			</Disclosure>
		</Card>
	),
}

/** A summary readable at rest above the disclosure (run setup): the current
 *  value costs zero clicks; the controls stay one snap away. */
export const WithSummaryAtRest: Story = {
	render: () => (
		<Card label="Run setup">
			<p className="run-setup-summary">Claude Code · Default model · Worktree</p>
			<Disclosure label="Change setup" hideLabel="Hide setup">
				<p className="section-description">The four run-selection fields render here when open.</p>
			</Disclosure>
		</Card>
	),
}
