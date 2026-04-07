import type { DaemonStatus } from '../api'

interface Props {
	status: DaemonStatus | null
	onPoll: () => void
	onRefresh: () => void
	onTogglePause: () => void
}

export function Header({ status, onPoll, onRefresh, onTogglePause }: Props) {
	const paused = status?.queue.paused ?? true

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
			</div>
			<div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
				<a href='/settings' style={{
					padding: '5px 12px',
					color: 'var(--text-2)',
					textDecoration: 'none',
					fontSize: 12,
					fontWeight: 500,
				}}>
					Settings
				</a>
				<HeaderButton
					onClick={onTogglePause}
					active={!paused}
				>
					{paused ? 'Start' : 'Running'}
				</HeaderButton>
				<HeaderButton onClick={onPoll}>Poll</HeaderButton>
				<HeaderButton onClick={onRefresh}>Refresh</HeaderButton>
			</div>
		</header>
	)
}

function HeaderButton({ onClick, children, active }: { onClick: () => void; children: React.ReactNode; active?: boolean }) {
	return (
		<button
			onClick={onClick}
			style={{
				padding: '5px 12px',
				background: active ? 'var(--green)' : 'var(--bg-2)',
				border: '1px solid',
				borderColor: active ? 'var(--green)' : 'var(--border)',
				borderRadius: 'var(--radius-sm)',
				color: active ? '#fff' : 'var(--text-2)',
				cursor: 'pointer',
				fontSize: 12,
				fontFamily: 'var(--font-sans)',
				fontWeight: 500,
				transition: 'all 150ms',
			}}
			onMouseEnter={e => {
				if (!active) {
					e.currentTarget.style.borderColor = 'var(--border-hover)'
					e.currentTarget.style.color = 'var(--text-1)'
				}
			}}
			onMouseLeave={e => {
				if (!active) {
					e.currentTarget.style.borderColor = 'var(--border)'
					e.currentTarget.style.color = 'var(--text-2)'
				}
			}}
		>
			{children}
		</button>
	)
}
