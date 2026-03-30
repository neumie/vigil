import type { DaemonStatus, TaskRecord } from '../api'
import { StatusBadge } from './StatusBadge'
import { useRelativeTime } from '../hooks'

interface Props {
	tasks: TaskRecord[]
	status: DaemonStatus | null
	selectedId: string | null
	taskBaseUrl?: string
	onSelect: (id: string | null) => void
	onRetry: (id: string) => void
	onCancel: (id: string) => void
}

export function TaskList({ tasks, status, selectedId, taskBaseUrl, onSelect, onRetry, onCancel }: Props) {
	const active = tasks.filter(t => t.status === 'processing')
	const queued = tasks.filter(t => t.status === 'queued')
	const done = tasks.filter(t => t.status === 'completed' || t.status === 'failed' || t.status === 'cancelled')

	return (
		<aside style={{
			width: 380,
			borderRight: '1px solid var(--border)',
			background: 'var(--bg-1)',
			display: 'flex',
			flexDirection: 'column',
			overflow: 'hidden',
			flexShrink: 0,
		}}>
			{/* Stats bar */}
			{status && (
				<div style={{
					display: 'flex',
					gap: 1,
					padding: '12px 16px',
					borderBottom: '1px solid var(--border)',
				}}>
					<Stat label="Active" value={status.queue.active} color="var(--blue)" />
					<Stat label="Queued" value={status.queue.pending} color="var(--text-3)" />
					<Stat label="Done" value={done.filter(t => t.status === 'completed').length} color="var(--green)" />
					<Stat label="Failed" value={done.filter(t => t.status === 'failed').length} color="var(--red)" />
				</div>
			)}

			{/* Task list */}
			<div style={{ flex: 1, overflow: 'auto' }}>
				{active.length > 0 && (
					<Section label="Active">
						{active.map(t => (
							<TaskRow key={t.id} task={t} selected={t.id === selectedId} taskBaseUrl={taskBaseUrl}
								onClick={() => onSelect(t.id)} onCancel={() => onCancel(t.id)} />
						))}
					</Section>
				)}
				{queued.length > 0 && (
					<Section label="Queued">
						{queued.map(t => (
							<TaskRow key={t.id} task={t} selected={t.id === selectedId} taskBaseUrl={taskBaseUrl}
								onClick={() => onSelect(t.id)} />
						))}
					</Section>
				)}
				<Section label="Recent">
					{done.length === 0 ? (
						<p style={{ color: 'var(--text-4)', padding: '12px 16px', fontSize: 13 }}>No completed tasks yet.</p>
					) : (
						done.slice(0, 30).map(t => (
							<TaskRow key={t.id} task={t} selected={t.id === selectedId} taskBaseUrl={taskBaseUrl}
								onClick={() => onSelect(t.id)}
								onRetry={(t.status === 'failed' || t.status === 'cancelled') ? () => onRetry(t.id) : undefined} />
						))
					)}
				</Section>
			</div>
		</aside>
	)
}

function Stat({ label, value, color }: { label: string; value: number; color: string }) {
	return (
		<div style={{ flex: 1, textAlign: 'center' }}>
			<div style={{ fontSize: 18, fontWeight: 700, color, fontVariantNumeric: 'tabular-nums' }}>{value}</div>
			<div style={{ fontSize: 10, color: 'var(--text-4)', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 500 }}>{label}</div>
		</div>
	)
}

function Section({ label, children }: { label: string; children: React.ReactNode }) {
	return (
		<div>
			<div style={{
				padding: '8px 16px',
				fontSize: 10,
				fontWeight: 600,
				color: 'var(--text-4)',
				textTransform: 'uppercase',
				letterSpacing: '0.08em',
				background: 'var(--bg-0)',
				borderBottom: '1px solid var(--border)',
				position: 'sticky',
				top: 0,
				zIndex: 1,
			}}>
				{label}
			</div>
			{children}
		</div>
	)
}

function TaskRow({ task, selected, taskBaseUrl, onClick, onRetry, onCancel }: {
	task: TaskRecord
	selected: boolean
	taskBaseUrl?: string
	onClick: () => void
	onRetry?: () => void
	onCancel?: () => void
}) {
	const elapsed = useRelativeTime(task.startedAt)

	return (
		<div
			onClick={onClick}
			style={{
				display: 'flex',
				flexDirection: 'column',
				gap: 4,
				padding: '10px 16px',
				borderBottom: '1px solid var(--border)',
				cursor: 'pointer',
				background: selected ? 'var(--accent-dim)' : 'transparent',
				borderLeft: selected ? '2px solid var(--accent)' : '2px solid transparent',
				transition: 'background 150ms',
			}}
			onMouseEnter={e => { if (!selected) e.currentTarget.style.background = 'var(--bg-2)' }}
			onMouseLeave={e => { if (!selected) e.currentTarget.style.background = 'transparent' }}
		>
			<div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
				<StatusBadge value={task.status} type="status" />
				{task.tier && <StatusBadge value={task.tier} type="tier" />}
				{elapsed && <span style={{ fontSize: 11, color: 'var(--text-4)', marginLeft: 'auto', fontFamily: 'var(--font-mono)' }}>{elapsed}</span>}
			</div>
			<div style={{ fontSize: 13, color: selected ? 'var(--text-0)' : 'var(--text-1)', lineHeight: 1.4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
				{task.title}
			</div>
			<div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11 }}>
				<span style={{ color: 'var(--text-4)' }}>{task.projectSlug}</span>
				{taskBaseUrl && (
					<a href={`${taskBaseUrl}${task.clientcareId}`} target="_blank" rel="noreferrer"
						onClick={e => e.stopPropagation()} style={{ color: 'var(--accent)', textDecoration: 'none' }}>
						source
					</a>
				)}
				{task.prUrl && (
					<a href={task.prUrl} target="_blank" rel="noreferrer"
						onClick={e => e.stopPropagation()} style={{ color: 'var(--blue)', textDecoration: 'none' }}>
						PR
					</a>
				)}
				<span style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
					{onCancel && (
						<button onClick={e => { e.stopPropagation(); onCancel() }}
							style={{ background: 'none', border: 'none', color: 'var(--red)', cursor: 'pointer', fontSize: 11, fontFamily: 'var(--font-sans)', fontWeight: 500 }}>
							Cancel
						</button>
					)}
					{onRetry && (
						<button onClick={e => { e.stopPropagation(); onRetry() }}
							style={{ background: 'none', border: 'none', color: 'var(--amber)', cursor: 'pointer', fontSize: 11, fontFamily: 'var(--font-sans)', fontWeight: 500 }}>
							Retry
						</button>
					)}
				</span>
			</div>
		</div>
	)
}
