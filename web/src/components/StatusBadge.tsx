const tierColors: Record<string, string> = {
	trivial: '#22c55e',
	simple: '#3b82f6',
	complex: '#f59e0b',
	unclear: '#ef4444',
}

const statusColors: Record<string, string> = {
	queued: '#71717a',
	processing: '#3b82f6',
	completed: '#22c55e',
	failed: '#ef4444',
	skipped: '#71717a',
}

export function StatusBadge({ value, type }: { value: string; type: 'tier' | 'status' }) {
	const colors = type === 'tier' ? tierColors : statusColors
	const color = colors[value] ?? '#71717a'

	return (
		<span
			style={{
				display: 'inline-block',
				padding: '2px 8px',
				borderRadius: 4,
				fontSize: 12,
				fontWeight: 600,
				color,
				background: `${color}20`,
				border: `1px solid ${color}40`,
				textTransform: 'uppercase',
			}}
		>
			{value}
		</span>
	)
}
