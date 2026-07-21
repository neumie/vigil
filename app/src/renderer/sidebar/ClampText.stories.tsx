import type { Meta, StoryObj } from '@storybook/react-vite'
import { ClampText } from './ui'

const meta: Meta<typeof ClampText> = {
	title: 'Primitives/Clamp text',
	component: ClampText,
	decorators: [story => <div style={{ width: 316 }}>{story()}</div>],
}

export default meta
type Story = StoryObj<typeof ClampText>

export const Short: Story = {
	args: { text: 'Shipped a one-line fix; PR opened against main.' },
}

export const Long: Story = {
	args: {
		text: 'Renamed the legacy vigil references across the daemon and app, kept the compatibility fallbacks for pre-rename installs, and updated the launchd job identity. The plist migration unloads com.vigil.daemon before installing com.helm.daemon so a stale KeepAlive job cannot respawn the old binary. Added regression tests for the config fallback order and verified the extension still reaches the daemon on :7474.',
	},
}
