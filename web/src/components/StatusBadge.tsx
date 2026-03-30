const tierColors: Record<string, string> = {
	trivial: 'var(--green)',
	simple: 'var(--blue)',
	complex: 'var(--amber)',
	unclear: 'var(--red)',
}

const statusColors: Record<string, string> = {
	queued: 'var(--text-3)',
	processing: 'var(--blue)',
	completed: 'var(--green)',
	failed: 'var(--red)',
	cancelled: 'var(--amber)',
	skipped: 'var(--text-3)',
}

export function StatusBadge({ value, type }: { value: string; type: 'tier' | 'status' }) {
	const colors = type === 'tier' ? tierColors : statusColors
	const color = colors[value] ?? 'var(--text-3)'

	return (
		<span
			style={{
				display: 'inline-block',
				padding: '1px 6px',
				borderRadius: 4,
				fontSize: 10,
				fontWeight: 600,
				color,
				background: `color-mix(in srgb, ${color} 15%, transparent)`,
				border: `1px solid color-mix(in srgb, ${color} 30%, transparent)`,
				textTransform: 'uppercase',
				letterSpacing: '0.04em',
				lineHeight: '18px',
			}}
		>
			{value}
		</span>
	)
}
