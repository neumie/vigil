import type { DashboardTone } from '../api'

const statusColors: Record<string, string> = {
	queued: 'var(--text-3)',
	processing: 'var(--blue)',
	completed: 'var(--green)',
	review: 'var(--amber)',
	failed: 'var(--red)',
	cancelled: 'var(--amber)',
	skipped: 'var(--text-3)',
}

const toneColors: Record<DashboardTone, string> = {
	gray: 'var(--text-3)',
	blue: 'var(--blue)',
	green: 'var(--green)',
	amber: 'var(--amber)',
	red: 'var(--red)',
}

export function StatusBadge({ value, tone }: { value: string; tone?: DashboardTone }) {
	const color = tone ? toneColors[tone] : (statusColors[value.toLowerCase()] ?? 'var(--text-3)')

	return (
		<span
			style={{
				display: 'inline-block',
				padding: '2px 8px',
				borderRadius: 999,
				fontSize: 10,
				fontWeight: 600,
				color,
				background: `color-mix(in srgb, ${color} 16%, transparent)`,
				textTransform: 'uppercase',
				letterSpacing: '0.04em',
				lineHeight: 1.5,
			}}
		>
			{value}
		</span>
	)
}
