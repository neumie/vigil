import type { TaskRecord } from '../api'
import { ActivityTimeline } from './ActivityTimeline'
import { LiveOutput } from './LiveOutput'
import { StatusBadge } from './StatusBadge'

interface Props {
	task: TaskRecord
	taskBaseUrl?: string
	onRetry: () => void
	onCancel: () => void
}

export function TaskDetail({ task, taskBaseUrl, onRetry, onCancel }: Props) {
	const files = task.filesChanged ? JSON.parse(task.filesChanged) as string[] : []
	const isActive = task.status === 'processing'

	return (
		<div style={{ display: 'flex', flexDirection: 'column', gap: 20, maxWidth: 900 }}>
			{/* Header */}
			<div>
				<div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
					<StatusBadge value={task.status} type="status" />
					{task.tier && <StatusBadge value={task.tier} type="tier" />}
					{isActive && (
						<button onClick={onCancel} style={{
							marginLeft: 'auto', padding: '4px 12px', background: 'var(--red-dim)', border: '1px solid color-mix(in srgb, var(--red) 40%, transparent)',
							borderRadius: 'var(--radius-sm)', color: 'var(--red)', cursor: 'pointer', fontSize: 12, fontFamily: 'var(--font-sans)', fontWeight: 500,
						}}>Cancel</button>
					)}
					{(task.status === 'failed' || task.status === 'cancelled') && (
						<button onClick={onRetry} style={{
							marginLeft: 'auto', padding: '4px 12px', background: 'var(--amber-dim)', border: '1px solid color-mix(in srgb, var(--amber) 40%, transparent)',
							borderRadius: 'var(--radius-sm)', color: 'var(--amber)', cursor: 'pointer', fontSize: 12, fontFamily: 'var(--font-sans)', fontWeight: 500,
						}}>Retry</button>
					)}
				</div>
				<h2 style={{ fontSize: 18, fontWeight: 600, color: 'var(--text-0)', lineHeight: 1.3 }}>{task.title}</h2>
			</div>

			{/* Meta */}
			<div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 8 }}>
				<Meta label="Project" value={task.projectSlug} />
				{taskBaseUrl && <Meta label="Source" value={`${taskBaseUrl}${task.clientcareId}`} link />}
				{task.solverConfidence != null && <Meta label="Confidence" value={`${(task.solverConfidence * 100).toFixed(0)}%`} />}
				{task.branchName && <Meta label="Branch" value={task.branchName} mono />}
				{task.prUrl && <Meta label="PR" value={task.prUrl} link />}
				{task.errorMessage && <Meta label={`Error (${task.errorPhase ?? '?'})`} value={task.errorMessage} error />}
			</div>

			{/* Summary */}
			{task.solverSummary && (
				<Card title="Summary">
					<p style={{ fontSize: 13, color: 'var(--text-1)', lineHeight: 1.6 }}>{task.solverSummary}</p>
				</Card>
			)}

			{/* Files changed */}
			{files.length > 0 && (
				<Card title={`Files Changed (${files.length})`}>
					{files.map(f => (
						<div key={f} style={{ fontSize: 12, fontFamily: 'var(--font-mono)', color: 'var(--text-2)', padding: '2px 0' }}>{f}</div>
					))}
				</Card>
			)}

			{/* Live Output */}
			{(isActive || task.status === 'failed' || task.status === 'cancelled') && (
				<Card title="Output">
					<LiveOutput taskId={task.id} isActive={isActive} />
				</Card>
			)}

			{/* Activity Timeline */}
			<Card title="Activity">
				<ActivityTimeline taskId={task.id} />
			</Card>
		</div>
	)
}

function Meta({ label, value, mono, link, error }: {
	label: string; value: string; mono?: boolean; link?: boolean; error?: boolean
}) {
	return (
		<div style={{
			padding: '8px 12px', background: 'var(--bg-2)',
			border: `1px solid ${error ? 'color-mix(in srgb, var(--red) 30%, transparent)' : 'var(--border)'}`,
			borderRadius: 'var(--radius-sm)',
		}}>
			<div style={{ fontSize: 10, color: error ? 'var(--red)' : 'var(--text-4)', marginBottom: 2, textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 500 }}>{label}</div>
			{link ? (
				<a href={value} target="_blank" rel="noreferrer" style={{ fontSize: 12, color: 'var(--blue)', wordBreak: 'break-all', textDecoration: 'none' }}>
					{value.length > 60 ? `${value.slice(0, 60)}...` : value}
				</a>
			) : (
				<div style={{
					fontSize: 12, color: error ? 'color-mix(in srgb, var(--red) 70%, white)' : 'var(--text-1)',
					fontFamily: mono ? 'var(--font-mono)' : 'inherit', wordBreak: 'break-all',
				}}>{value}</div>
			)}
		</div>
	)
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
	return (
		<div style={{ background: 'var(--bg-2)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: 16 }}>
			<h3 style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-4)', marginBottom: 12, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{title}</h3>
			{children}
		</div>
	)
}
