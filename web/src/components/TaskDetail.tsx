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
		<div style={{ maxWidth: 760, margin: '0 auto' }}>
			{/* Title + badges */}
			<h2 style={{ fontSize: 20, fontWeight: 600, color: 'var(--text-0)', lineHeight: 1.4, marginBottom: 12 }}>
				{task.title}
			</h2>

			<div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 24 }}>
				<StatusBadge value={task.status} type="status" />
				{task.tier && <StatusBadge value={task.tier} type="tier" />}
				{task.solverConfidence != null && (
					<span style={{ fontSize: 12, color: 'var(--text-3)' }}>{(task.solverConfidence * 100).toFixed(0)}% confidence</span>
				)}

				<span style={{ flex: 1 }} />

				{taskBaseUrl && (
					<a href={`${taskBaseUrl}${task.clientcareId}`} target="_blank" rel="noreferrer"
						style={{ fontSize: 12, color: 'var(--accent)', textDecoration: 'none', fontWeight: 500 }}>
						Source
					</a>
				)}
				{task.prUrl && (
					<a href={task.prUrl} target="_blank" rel="noreferrer"
						style={{ fontSize: 12, color: 'var(--blue)', textDecoration: 'none', fontWeight: 500 }}>
						{formatPrLabel(task.prUrl)}
					</a>
				)}
			</div>

			{/* Info line */}
			<div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 20px', fontSize: 12, color: 'var(--text-3)', marginBottom: 24 }}>
				<span>Project: <strong style={{ color: 'var(--text-1)', fontWeight: 500 }}>{task.projectSlug}</strong></span>
				{task.branchName && (
					<span>Branch: <code style={{ color: 'var(--text-2)', fontFamily: 'var(--font-mono)', fontSize: 11 }}>{task.branchName}</code></span>
				)}
			</div>

			{/* Error */}
			{task.errorMessage && (
				<div style={{
					padding: '12px 16px', marginBottom: 24, borderRadius: 'var(--radius-sm)',
					background: 'var(--red-dim)', border: '1px solid color-mix(in srgb, var(--red) 25%, transparent)',
				}}>
					<div style={{ fontSize: 11, color: 'var(--red)', fontWeight: 600, marginBottom: 4, textTransform: 'uppercase' }}>
						Error{task.errorPhase ? ` (${task.errorPhase})` : ''}
					</div>
					<div style={{ fontSize: 13, color: 'color-mix(in srgb, var(--red) 80%, white)', lineHeight: 1.5 }}>{task.errorMessage}</div>
				</div>
			)}

			{/* Actions */}
			<div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 32 }}>
				{isActive && <ActionBtn label="Cancel" color="var(--red)" onClick={onCancel} />}
				{task.status !== 'processing' && task.status !== 'queued' && (
					<>
						{task.status !== 'completed' && <ActionBtn label="Complete" color="var(--green)" onClick={() => onSetStatus('completed')} />}
						{(task.status === 'failed' || task.status === 'cancelled') && <ActionBtn label="Retry" color="var(--accent)" onClick={onRetry} />}
						{task.status !== 'skipped' && <ActionBtn label="Skip" color="var(--text-3)" onClick={() => onSetStatus('skipped')} />}
					</>
				)}
			</div>

			{/* Summary */}
			{task.solverSummary && (
				<Section title="Summary">
					<p style={{ fontSize: 14, color: 'var(--text-1)', lineHeight: 1.7 }}>{task.solverSummary}</p>
				</Section>
			)}

			{/* Files changed */}
			{files.length > 0 && (
				<Section title={`Files changed (${files.length})`}>
					{files.map(f => (
						<div key={f} style={{ fontSize: 12, fontFamily: 'var(--font-mono)', color: 'var(--text-2)', padding: '2px 0' }}>{f}</div>
					))}
				</Section>
			)}

			{/* Live Output */}
			{(isActive || task.status === 'failed' || task.status === 'cancelled') && (
				<Section title="Output">
					<LiveOutput taskId={task.id} isActive={isActive} />
				</Section>
			)}

			{/* Activity */}
			<Section title="Activity">
				<ActivityTimeline taskId={task.id} />
			</Section>
		</div>
	)
}

function formatPrLabel(url: string): string {
	const match = url.match(/\/pull\/(\d+)/)
	return match ? `PR #${match[1]}` : 'Pull Request'
}

function ActionBtn({ label, color, onClick }: { label: string; color: string; onClick: () => void }) {
	return (
		<button onClick={onClick} style={{
			padding: '6px 16px', background: `color-mix(in srgb, ${color} 10%, transparent)`,
			border: `1px solid color-mix(in srgb, ${color} 25%, transparent)`,
			borderRadius: 'var(--radius-sm)', color, cursor: 'pointer', fontSize: 13,
			fontFamily: 'var(--font-sans)', fontWeight: 500, transition: 'all 150ms',
		}}>{label}</button>
	)
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
	return (
		<div style={{ marginBottom: 28 }}>
			<div style={{
				fontSize: 12, fontWeight: 600, color: 'var(--text-3)', marginBottom: 12,
				paddingBottom: 8, borderBottom: '1px solid var(--border)',
			}}>
				{title}
			</div>
			{children}
		</div>
	)
}
