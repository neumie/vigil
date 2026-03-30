import { useCallback, useEffect, useState } from 'react'
import { type AppConfig, type DaemonStatus, type TaskRecord, api } from './api'
import { Dashboard } from './components/Dashboard'
import { TaskDetail } from './components/TaskDetail'

export function App() {
	const [status, setStatus] = useState<DaemonStatus | null>(null)
	const [tasks, setTasks] = useState<TaskRecord[]>([])
	const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null)
	const [config, setConfig] = useState<AppConfig>({})

	useEffect(() => {
		api.config().then(setConfig).catch(() => {})
	}, [])

	const refresh = useCallback(async () => {
		try {
			const [s, t] = await Promise.all([api.status(), api.tasks()])
			setStatus(s)
			setTasks(t)
		} catch (err) {
			console.error('Failed to refresh:', err)
		}
	}, [])

	useEffect(() => {
		refresh()
		const interval = setInterval(refresh, 5000)
		return () => clearInterval(interval)
	}, [refresh])

	const selectedTask = selectedTaskId ? tasks.find(t => t.id === selectedTaskId) ?? null : null

	return (
		<div style={{ maxWidth: 1200, margin: '0 auto', padding: '24px 16px' }}>
			<header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
				<h1 style={{ fontSize: 24, fontWeight: 700 }}>
					<span style={{ color: '#a78bfa' }}>vigil</span>
					{status && (
						<span style={{ fontSize: 13, color: '#71717a', marginLeft: 12, fontWeight: 400 }}>
							{status.projects.join(', ')} &middot; polling every {status.pollInterval}s
						</span>
					)}
				</h1>
				<div style={{ display: 'flex', gap: 8 }}>
					<button onClick={() => api.triggerPoll().then(refresh)} style={buttonStyle}>
						Poll Now
					</button>
					<button onClick={refresh} style={buttonStyle}>
						Refresh
					</button>
				</div>
			</header>

			{selectedTask ? (
				<TaskDetail task={selectedTask} taskBaseUrl={config.taskBaseUrl} onBack={() => setSelectedTaskId(null)} onRetry={async () => {
					await api.retry(selectedTask.id)
					refresh()
				}} />
			) : (
				<Dashboard
					status={status}
					tasks={tasks}
					taskBaseUrl={config.taskBaseUrl}
					onSelectTask={id => setSelectedTaskId(id)}
					onRetry={async id => {
						await api.retry(id)
						refresh()
					}}
				/>
			)}
		</div>
	)
}

const buttonStyle: React.CSSProperties = {
	padding: '6px 14px',
	background: '#27272a',
	border: '1px solid #3f3f46',
	borderRadius: 6,
	color: '#e4e4e7',
	cursor: 'pointer',
	fontSize: 13,
}
