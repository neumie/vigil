import type { TaskRecord } from '../api'
import { ActivityTimeline } from './ActivityTimeline'
import { StatusBadge } from './StatusBadge'

interface Props {
	task: TaskRecord
	onBack: () => void
	onRetry: () => void
}

export function TaskDetail({ task, onBack, onRetry }: Props) {
	const files = task.filesChanged ? JSON.parse(task.filesChanged) as string[] : []

	return (
		<div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
			<button onClick={onBack} style={{ alignSelf: 'flex-start', background: 'none', border: 'none', color: '#a78bfa', cursor: 'pointer', fontSize: 14 }}>
				&larr; Back to dashboard
			</button>

			{/* Header */}
			<div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
				<StatusBadge value={task.status} type="status" />
				{task.tier && <StatusBadge value={task.tier} type="tier" />}
				<h2 style={{ fontSize: 20, fontWeight: 600 }}>{task.title}</h2>
			</div>

			{/* Meta grid */}
			<div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 12 }}>
				<MetaCard label="Project" value={task.projectSlug} />
				<MetaCard label="Confidence" value={task.solverConfidence != null ? `${(task.solverConfidence * 100).toFixed(0)}%` : '—'} />
				<MetaCard label="Branch" value={task.branchName ?? '—'} mono />
				<MetaCard label="Worktree" value={task.worktreePath ?? '—'} mono />
				{task.prUrl && <MetaCard label="PR" value={task.prUrl} link />}
				{task.errorMessage && <MetaCard label={`Error (${task.errorPhase ?? '?'})`} value={task.errorMessage} error />}
			</div>

			{/* Summary */}
			{task.solverSummary && (
				<Card title="Summary">
					<p style={{ fontSize: 14, color: '#d4d4d8' }}>{task.solverSummary}</p>
				</Card>
			)}

			{/* Files changed */}
			{files.length > 0 && (
				<Card title="Files Changed">
					{files.map(f => (
						<div key={f} style={{ fontSize: 13, fontFamily: 'monospace', color: '#a1a1aa', padding: '2px 0' }}>{f}</div>
					))}
				</Card>
			)}

			{/* Activity Timeline */}
			<Card title="Activity">
				<ActivityTimeline taskId={task.id} />
			</Card>

			{/* Actions */}
			{task.status === 'failed' && (
				<button onClick={onRetry} style={{
					padding: '8px 20px',
					background: '#f59e0b20',
					border: '1px solid #f59e0b40',
					borderRadius: 6,
					color: '#f59e0b',
					cursor: 'pointer',
					fontSize: 14,
					alignSelf: 'flex-start',
				}}>
					Retry Task
				</button>
			)}
		</div>
	)
}

function MetaCard({ label, value, mono, link, error }: {
	label: string
	value: string
	mono?: boolean
	link?: boolean
	error?: boolean
}) {
	return (
		<div style={{ padding: '10px 14px', background: '#18181b', border: `1px solid ${error ? '#ef444440' : '#27272a'}`, borderRadius: 8 }}>
			<div style={{ fontSize: 11, color: error ? '#ef4444' : '#71717a', marginBottom: 4, textTransform: 'uppercase' }}>{label}</div>
			{link ? (
				<a href={value} target="_blank" rel="noreferrer" style={{ fontSize: 13, color: '#3b82f6', wordBreak: 'break-all' }}>
					{value}
				</a>
			) : (
				<div style={{
					fontSize: 13,
					color: error ? '#fca5a5' : '#d4d4d8',
					fontFamily: mono ? 'monospace' : 'inherit',
					wordBreak: 'break-all',
				}}>
					{value}
				</div>
			)}
		</div>
	)
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
	return (
		<div style={{ background: '#18181b', border: '1px solid #27272a', borderRadius: 8, padding: 16 }}>
			<h3 style={{ fontSize: 13, fontWeight: 600, color: '#a1a1aa', marginBottom: 12, textTransform: 'uppercase', letterSpacing: 1 }}>
				{title}
			</h3>
			{children}
		</div>
	)
}
