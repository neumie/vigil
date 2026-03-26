import type { DaemonStatus, TaskRecord } from '../api'
import { StatusBadge } from './StatusBadge'

interface Props {
	status: DaemonStatus | null
	tasks: TaskRecord[]
	onSelectTask: (id: string) => void
	onRetry: (id: string) => void
}

export function Dashboard({ status, tasks, onSelectTask, onRetry }: Props) {
	const active = tasks.filter(t => t.status === 'processing')
	const queued = tasks.filter(t => t.status === 'queued')
	const completed = tasks.filter(t => t.status === 'completed' || t.status === 'failed')

	return (
		<div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
			{/* Queue summary */}
			{status && (
				<div style={{ display: 'flex', gap: 16 }}>
					<StatCard label="Active" value={status.queue.active} max={status.queue.maxConcurrency} color="#3b82f6" />
					<StatCard label="Queued" value={status.queue.pending} color="#71717a" />
					<StatCard label="Completed" value={completed.filter(t => t.status === 'completed').length} color="#22c55e" />
					<StatCard label="Failed" value={completed.filter(t => t.status === 'failed').length} color="#ef4444" />
				</div>
			)}

			{/* Active tasks */}
			{active.length > 0 && (
				<Section title="Active">
					{active.map(t => (
						<TaskRow key={t.id} task={t} onClick={() => onSelectTask(t.id)} />
					))}
				</Section>
			)}

			{/* Queued tasks */}
			{queued.length > 0 && (
				<Section title="Queue">
					{queued.map(t => (
						<TaskRow key={t.id} task={t} onClick={() => onSelectTask(t.id)} />
					))}
				</Section>
			)}

			{/* Recent */}
			<Section title="Recent">
				{completed.length === 0 ? (
					<p style={{ color: '#71717a', padding: 16 }}>No completed tasks yet.</p>
				) : (
					completed.slice(0, 20).map(t => (
						<TaskRow key={t.id} task={t} onClick={() => onSelectTask(t.id)} onRetry={
							t.status === 'failed' ? () => onRetry(t.id) : undefined
						} />
					))
				)}
			</Section>
		</div>
	)
}

function StatCard({ label, value, max, color }: { label: string; value: number; max?: number; color: string }) {
	return (
		<div style={{
			flex: 1,
			padding: '16px 20px',
			background: '#18181b',
			border: '1px solid #27272a',
			borderRadius: 8,
		}}>
			<div style={{ fontSize: 13, color: '#71717a', marginBottom: 4 }}>{label}</div>
			<div style={{ fontSize: 28, fontWeight: 700, color }}>
				{value}
				{max !== undefined && <span style={{ fontSize: 14, color: '#52525b' }}>/{max}</span>}
			</div>
		</div>
	)
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
	return (
		<div>
			<h2 style={{ fontSize: 14, fontWeight: 600, color: '#a1a1aa', marginBottom: 8, textTransform: 'uppercase', letterSpacing: 1 }}>
				{title}
			</h2>
			<div style={{ background: '#18181b', border: '1px solid #27272a', borderRadius: 8, overflow: 'hidden' }}>
				{children}
			</div>
		</div>
	)
}

function TaskRow({ task, onClick, onRetry }: { task: TaskRecord; onClick: () => void; onRetry?: () => void }) {
	const elapsed = task.startedAt
		? formatDuration(new Date(task.completedAt ?? Date.now()).getTime() - new Date(task.startedAt).getTime())
		: null

	return (
		<div
			onClick={onClick}
			style={{
				display: 'flex',
				alignItems: 'center',
				gap: 12,
				padding: '12px 16px',
				borderBottom: '1px solid #27272a',
				cursor: 'pointer',
			}}
			onMouseEnter={e => { (e.currentTarget as HTMLDivElement).style.background = '#1f1f23' }}
			onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.background = 'transparent' }}
		>
			<StatusBadge value={task.status} type="status" />
			{task.tier && <StatusBadge value={task.tier} type="tier" />}
			<span style={{ flex: 1, fontSize: 14 }}>{task.title}</span>
			<span style={{ fontSize: 12, color: '#71717a' }}>{task.projectSlug}</span>
			{elapsed && <span style={{ fontSize: 12, color: '#52525b' }}>{elapsed}</span>}
			{task.prUrl && (
				<a
					href={task.prUrl}
					target="_blank"
					rel="noreferrer"
					onClick={e => e.stopPropagation()}
					style={{ fontSize: 12, color: '#3b82f6' }}
				>
					PR
				</a>
			)}
			{onRetry && (
				<button
					onClick={e => { e.stopPropagation(); onRetry() }}
					style={{ fontSize: 12, color: '#f59e0b', background: 'none', border: 'none', cursor: 'pointer' }}
				>
					Retry
				</button>
			)}
		</div>
	)
}

function formatDuration(ms: number): string {
	const seconds = Math.floor(ms / 1000)
	if (seconds < 60) return `${seconds}s`
	const minutes = Math.floor(seconds / 60)
	if (minutes < 60) return `${minutes}m ${seconds % 60}s`
	const hours = Math.floor(minutes / 60)
	return `${hours}h ${minutes % 60}m`
}
