import type { DaemonStatus } from '../api'

interface Props {
	status: DaemonStatus | null
	onPoll: () => void
	onRefresh: () => void
}

export function Header({ status, onPoll, onRefresh }: Props) {
	return (
		<header style={{
			display: 'flex',
			alignItems: 'center',
			justifyContent: 'space-between',
			padding: '12px 24px',
			borderBottom: '1px solid var(--border)',
			background: 'var(--bg-1)',
			flexShrink: 0,
		}}>
			<div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
				<h1 style={{ fontSize: 18, fontWeight: 700, color: 'var(--accent)', letterSpacing: '-0.02em' }}>
					vigil
				</h1>
				{status && (
					<span style={{ fontSize: 12, color: 'var(--text-3)' }}>
						{status.projects.join(', ')} &middot; {status.pollInterval}s
					</span>
				)}
			</div>
			<div style={{ display: 'flex', gap: 6 }}>
				<HeaderButton onClick={onPoll}>Poll</HeaderButton>
				<HeaderButton onClick={onRefresh}>Refresh</HeaderButton>
			</div>
		</header>
	)
}

function HeaderButton({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
	return (
		<button
			onClick={onClick}
			style={{
				padding: '5px 12px',
				background: 'var(--bg-2)',
				border: '1px solid var(--border)',
				borderRadius: 'var(--radius-sm)',
				color: 'var(--text-2)',
				cursor: 'pointer',
				fontSize: 12,
				fontFamily: 'var(--font-sans)',
				fontWeight: 500,
				transition: 'all 150ms',
			}}
			onMouseEnter={e => {
				e.currentTarget.style.borderColor = 'var(--border-hover)'
				e.currentTarget.style.color = 'var(--text-1)'
			}}
			onMouseLeave={e => {
				e.currentTarget.style.borderColor = 'var(--border)'
				e.currentTarget.style.color = 'var(--text-2)'
			}}
		>
			{children}
		</button>
	)
}
