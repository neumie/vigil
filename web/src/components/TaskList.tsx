import { useState } from 'react'
import type { DaemonStatus, TaskRecord } from '../api'
import { StatusBadge } from './StatusBadge'
import { useRelativeTime } from '../hooks'

type Tab = 'active' | 'queued' | 'archived'

interface Props {
	tasks: TaskRecord[]
	status: DaemonStatus | null
	selectedId: string | null
	taskBaseUrl?: string
	onSelect: (id: string | null) => void
	onRetry: (id: string) => void
	onCancel: (id: string) => void
	onSkip: (id: string) => void
	projects: string[]
	selectedProject: string | null
	onProjectChange: (slug: string | null) => void
}

export function TaskList({ tasks, status, selectedId, taskBaseUrl, onSelect, onRetry, onCancel, onSkip, projects, selectedProject, onProjectChange }: Props) {
	const [tab, setTab] = useState<Tab>('queued')

	const active = tasks.filter(t => t.status === 'processing')
	const queued = tasks.filter(t => t.status === 'queued')
	const archived = tasks.filter(t => t.status !== 'processing' && t.status !== 'queued')

	const tabItems: { key: Tab; label: string; count: number }[] = [
		{ key: 'active', label: 'Active', count: active.length },
		{ key: 'queued', label: 'Queued', count: queued.length },
		{ key: 'archived', label: 'Archived', count: archived.length },
	]

	const visibleTasks = tab === 'active' ? active : tab === 'queued' ? queued : archived

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
			{/* Project filter */}
			{projects.length > 1 && (
				<div style={{
					padding: '8px 12px',
					borderBottom: '1px solid var(--border)',
				}}>
					<select
						value={selectedProject ?? ''}
						onChange={e => onProjectChange(e.target.value || null)}
						style={{
							width: '100%',
							padding: '5px 8px',
							background: 'var(--bg-0)',
							border: '1px solid var(--border)',
							borderRadius: 'var(--radius-sm)',
							color: 'var(--text-1)',
							fontSize: 12,
							fontFamily: 'var(--font-sans)',
							outline: 'none',
							cursor: 'pointer',
						}}
					>
						<option value="">All projects</option>
						{projects.map(p => (
							<option key={p} value={p}>{p}</option>
						))}
					</select>
				</div>
			)}

			{/* Tabs */}
			<div style={{
				display: 'flex',
				background: 'var(--bg-1)',
				borderBottom: '1px solid var(--border)',
			}}>
				{tabItems.map(t => (
					<TabButton
						key={t.key}
						active={tab === t.key}
						count={t.count}
						onClick={() => setTab(t.key)}
					>
						{t.label}
					</TabButton>
				))}
			</div>

			{/* Task list */}
			<div style={{ flex: 1, overflow: 'auto' }}>
				{visibleTasks.length === 0 ? (
					<p style={{ color: 'var(--text-4)', padding: '24px 16px', fontSize: 13, textAlign: 'center' }}>
						No {tab} tasks.
					</p>
				) : (
					visibleTasks.map(t => (
						<TaskRow
							key={t.id}
							task={t}
							selected={t.id === selectedId}
							taskBaseUrl={taskBaseUrl}
							onClick={() => onSelect(t.id)}
							onCancel={(t.status === 'processing' || t.status === 'queued') ? () => onCancel(t.id) : undefined}
							onSkip={t.status === 'queued' ? () => onSkip(t.id) : undefined}
							onRetry={(t.status !== 'processing' && t.status !== 'queued') ? () => onRetry(t.id) : undefined}
						/>
					))
				)}
			</div>
		</aside>
	)
}

function TabButton({ active, count, onClick, children }: {
	active: boolean
	count: number
	onClick: () => void
	children: React.ReactNode
}) {
	return (
		<button
			onClick={onClick}
			style={{
				flex: 1,
				padding: '12px 0',
				background: 'none',
				border: 'none',
				borderBottom: active ? '2px solid var(--accent)' : '2px solid transparent',
				color: active ? 'var(--text-0)' : 'var(--text-3)',
				cursor: 'pointer',
				fontSize: 12,
				fontFamily: 'var(--font-sans)',
				fontWeight: 500,
				transition: 'color 150ms',
				display: 'flex',
				alignItems: 'center',
				justifyContent: 'center',
				gap: 5,
			}}
		>
			{children}
			{count > 0 && (
				<span style={{
					fontSize: 10,
					fontWeight: 600,
					color: active ? 'var(--accent)' : 'var(--text-4)',
					fontVariantNumeric: 'tabular-nums',
				}}>
					{count}
				</span>
			)}
		</button>
	)
}

function TaskRow({ task, selected, taskBaseUrl, onClick, onRetry, onCancel, onSkip }: {
	task: TaskRecord
	selected: boolean
	taskBaseUrl?: string
	onClick: () => void
	onRetry?: () => void
	onCancel?: () => void
	onSkip?: () => void
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
					{onSkip && (
						<button onClick={e => { e.stopPropagation(); onSkip() }}
							style={{ background: 'none', border: 'none', color: 'var(--text-3)', cursor: 'pointer', fontSize: 11, fontFamily: 'var(--font-sans)', fontWeight: 500 }}>
							Skip
						</button>
					)}
					{onCancel && (
						<button onClick={e => { e.stopPropagation(); onCancel() }}
							style={{ background: 'none', border: 'none', color: 'var(--red)', cursor: 'pointer', fontSize: 11, fontFamily: 'var(--font-sans)', fontWeight: 500 }}>
							Cancel
						</button>
					)}
					{onRetry && (
						<button onClick={e => { e.stopPropagation(); onRetry() }}
							style={{ background: 'none', border: 'none', color: 'var(--accent)', cursor: 'pointer', fontSize: 11, fontFamily: 'var(--font-sans)', fontWeight: 500 }}>
							Re-queue
						</button>
					)}
				</span>
			</div>
		</div>
	)
}
