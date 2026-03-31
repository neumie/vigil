import type { TaskRecord } from '../api'
import { ActivityTimeline } from './ActivityTimeline'
import { LiveOutput } from './LiveOutput'
import { StatusBadge } from './StatusBadge'

interface Props {
	task: TaskRecord
	taskBaseUrl?: string
	onRetry: () => void
	onCancel: () => void
	onSetStatus: (status: string) => void
}

export function TaskDetail({ task, taskBaseUrl, onRetry, onCancel, onSetStatus }: Props) {
	const files = task.filesChanged ? JSON.parse(task.filesChanged) as string[] : []
	const isActive = task.status === 'processing'

	return (
		<div style={{ display: 'flex', flexDirection: 'column', gap: 24, maxWidth: 860, margin: '0 auto' }}>
			{/* Header */}
			<div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
				<div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
					<StatusBadge value={task.status} type="status" />
					{task.tier && <StatusBadge value={task.tier} type="tier" />}
				</div>
				<h2 style={{ fontSize: 20, fontWeight: 600, color: 'var(--text-0)', lineHeight: 1.35 }}>{task.title}</h2>

				{/* Actions row */}
				<div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
					{taskBaseUrl && (
						<a href={`${taskBaseUrl}${task.clientcareId}`} target="_blank" rel="noreferrer"
							style={{ fontSize: 12, color: 'var(--accent)', textDecoration: 'none', fontWeight: 500 }}>
							View source
						</a>
					)}
					{task.prUrl && (
						<a href={task.prUrl} target="_blank" rel="noreferrer"
							style={{ fontSize: 12, color: 'var(--blue)', textDecoration: 'none', fontWeight: 500 }}>
							{formatPrLabel(task.prUrl)}
						</a>
					)}
					<div style={{ flex: 1 }} />
					{isActive && <StatusAction label="Cancel" color="var(--red)" onClick={onCancel} />}
					{task.status !== 'processing' && task.status !== 'queued' && (
						<>
							{task.status !== 'completed' && <StatusAction label="Complete" color="var(--green)" onClick={() => onSetStatus('completed')} />}
							{task.status !== 'failed' && <StatusAction label="Failed" color="var(--red)" onClick={() => onSetStatus('failed')} />}
							{task.status !== 'cancelled' && <StatusAction label="Cancel" color="var(--amber)" onClick={() => onSetStatus('cancelled')} />}
							{task.status !== 'skipped' && <StatusAction label="Skip" color="var(--text-3)" onClick={() => onSetStatus('skipped')} />}
							{(task.status === 'failed' || task.status === 'cancelled') && (
								<StatusAction label="Retry" color="var(--accent)" onClick={onRetry} />
							)}
						</>
					)}
				</div>
			</div>

			{/* Meta */}
			<div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 12 }}>
				<Meta label="Project" value={task.projectSlug} />
				{task.solverConfidence != null && <Meta label="Confidence" value={`${(task.solverConfidence * 100).toFixed(0)}%`} />}
				{task.branchName && <Meta label="Branch" value={task.branchName} mono />}
				{task.errorMessage && <Meta label={`Error (${task.errorPhase ?? '?'})`} value={task.errorMessage} error />}
			</div>

			{/* Summary */}
			{task.solverSummary && (
				<Card title="Summary">
					<p style={{ fontSize: 13, color: 'var(--text-1)', lineHeight: 1.7 }}>{task.solverSummary}</p>
				</Card>
			)}

			{/* Files changed */}
			{files.length > 0 && (
				<Card title={`Files Changed (${files.length})`}>
					<div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
						{files.map(f => (
							<div key={f} style={{ fontSize: 12, fontFamily: 'var(--font-mono)', color: 'var(--text-2)', padding: '3px 0' }}>{f}</div>
						))}
					</div>
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

function formatPrLabel(url: string): string {
	const match = url.match(/\/pull\/(\d+)/)
	return match ? `PR #${match[1]}` : 'Pull Request'
}

function Meta({ label, value, mono, error }: {
	label: string; value: string; mono?: boolean; error?: boolean
}) {
	return (
		<div style={{
			padding: '10px 14px', background: 'var(--bg-2)',
			border: `1px solid ${error ? 'color-mix(in srgb, var(--red) 30%, transparent)' : 'var(--border)'}`,
			borderRadius: 'var(--radius-sm)',
		}}>
			<div style={{ fontSize: 10, color: error ? 'var(--red)' : 'var(--text-4)', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 600 }}>{label}</div>
			<div style={{
				fontSize: 13, color: error ? 'color-mix(in srgb, var(--red) 70%, white)' : 'var(--text-1)',
				fontFamily: mono ? 'var(--font-mono)' : 'inherit', wordBreak: 'break-all', lineHeight: 1.4,
			}}>{value}</div>
		</div>
	)
}

function StatusAction({ label, color, onClick }: { label: string; color: string; onClick: () => void }) {
	return (
		<button onClick={onClick} style={{
			padding: '5px 14px', background: `color-mix(in srgb, ${color} 12%, transparent)`,
			border: `1px solid color-mix(in srgb, ${color} 30%, transparent)`,
			borderRadius: 'var(--radius-sm)', color, cursor: 'pointer', fontSize: 12,
			fontFamily: 'var(--font-sans)', fontWeight: 500, transition: 'all 150ms',
		}}>{label}</button>
	)
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
	return (
		<div style={{ background: 'var(--bg-2)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: 20 }}>
			<h3 style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-4)', marginBottom: 14, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{title}</h3>
			{children}
		</div>
	)
}
