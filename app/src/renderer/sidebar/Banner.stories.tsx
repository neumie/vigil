// Banner primitive (§3.12): three tones and the same shared grammar with an optional action.
import type { Meta, StoryObj } from '@storybook/react-vite'
import { Banner, Btn } from './ui'

const meta: Meta = {
	title: 'Primitives/Banner',
	decorators: [story => <div style={{ width: 340, display: 'flex', flexDirection: 'column', gap: 12 }}>{story()}</div>],
}

export default meta
type Story = StoryObj

export const ErrorBanner: Story = {
	name: 'Error',
	render: () => (
		<Banner tone="error" label="Run failed">
			The agent exited with code 1 before writing solver-result.json.
		</Banner>
	),
}

export const Warning: Story = {
	render: () => (
		<Banner tone="warning" label="Stale worktree">
			The recorded worktree path no longer exists; retry will recreate it.
		</Banner>
	),
}

export const Info: Story = {
	render: () => (
		<Banner tone="info" label="Planning">
			The planning workspace is open. No runnable spec has been detected yet.
		</Banner>
	),
}

/** Same info-banner grammar, with one top-aligned trailing action. */
export const WithAction: Story = {
	render: () => (
		<Banner
			tone="info"
			label="Restart required"
			action={
				<Btn tone="quiet" sm>
					Restart
				</Btn>
			}
		>
			The daemon must restart before these settings take effect.
		</Banner>
	),
}
