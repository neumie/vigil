// Inline disclosure (§3.20): the quiet show/hide toggle for heavy in-place
// evidence such as solve input and run setup pickers. Content SNAPS open —
// never height-animated — and renders only while open.
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

const INPUT = `Implement the approved task in the prepared worktree.
Preserve the existing authentication flow and add regression coverage.`

/** Closed at rest: the verb-first cue is the only footprint — a collapsed
 *  well contributes zero DOM. */
export const Closed: Story = {
	render: () => (
		<Card label="Solve input">
			<Disclosure label="Show input" hideLabel="Hide input">
				<section className="log-well">{INPUT}</section>
			</Disclosure>
		</Card>
	),
}

/** Open mount state: the cue flips to its hide verb and the well snaps into
 *  the group's flow. */
export const Open: Story = {
	render: () => (
		<Card label="Solve input">
			<Disclosure label="Show input" hideLabel="Hide input" defaultOpen>
				<section className="log-well">{INPUT}</section>
			</Disclosure>
		</Card>
	),
}

/** A summary readable at rest above the disclosure (execution setup): the current
 *  value costs zero clicks; the controls stay one snap away. */
export const WithSummaryAtRest: Story = {
	render: () => (
		<Card label="Execution setup">
			<p className="run-setup-summary">Claude Code · Default model · Worktree</p>
			<p className="run-caption">Applied to Start agent and Start loop.</p>
			<Disclosure label="Change setup" hideLabel="Hide setup">
				<p className="section-description">The four run-selection fields render here when open.</p>
			</Disclosure>
		</Card>
	),
}
