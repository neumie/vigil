// Disclosure group (§3.20): heavy inline evidence stays behind a quiet
// section-header action. Content SNAPS open, never height-animates, and renders
// only while open.
import type { Meta, StoryObj } from '@storybook/react-vite'
import { Disclosure } from './ui'

const meta: Meta = {
	title: 'Compositions/Disclosure group',
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

const INPUT = `Implement the approved task in the prepared worktree.
Preserve the existing authentication flow and add regression coverage.`

/** Closed at rest: the section header and its quiet action are the entire
 * visible footprint; the empty controlled-region shell stays hidden so the
 * action's aria-controls target remains valid. */
export const Closed: Story = {
	render: () => (
		<Disclosure heading="Solve input" label="Show" hideLabel="Hide">
			<section className="log-well">{INPUT}</section>
		</Disclosure>
	),
}

/** Open mount state: the action flips to Hide and the evidence snaps directly
 * into the section flow. */
export const Open: Story = {
	render: () => (
		<Disclosure heading="Solve input" label="Show" hideLabel="Hide" defaultOpen>
			<section className="log-well">{INPUT}</section>
		</Disclosure>
	),
}

/** A useful resting summary stays visible while only the editing controls are
 * conditional. */
export const WithSummaryAtRest: Story = {
	render: () => (
		<Disclosure
			heading="Execution setup"
			label="Change"
			hideLabel="Done"
			summary={
				<>
					<p className="run-setup-summary">Claude Code · Default model · Worktree</p>
					<p className="run-caption">Applied to Start agent and Start loop.</p>
				</>
			}
		>
			<p className="section-description">The four run-selection fields render here when open.</p>
		</Disclosure>
	),
}
