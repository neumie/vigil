import { useCallback, useEffect, useState } from 'react'
import { type AppConfig, type DaemonStatus, type TaskRecord, api } from './api'
import { TaskList } from './components/TaskList'
import { TaskDetail } from './components/TaskDetail'
import { Header } from './components/Header'
import { EmptyState } from './components/EmptyState'
import { useHashRoute, useInterval } from './hooks'

export function App() {
	const [status, setStatus] = useState<DaemonStatus | null>(null)
	const [tasks, setTasks] = useState<TaskRecord[]>([])
	const [config, setConfig] = useState<AppConfig>({})
	const { selectedTaskId, selectTask } = useHashRoute()

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

	useInterval(refresh, 5000)

	const selectedTask = selectedTaskId ? tasks.find(t => t.id === selectedTaskId) ?? null : null
	const activeCount = tasks.filter(t => t.status === 'processing').length
	const queuedCount = tasks.filter(t => t.status === 'queued').length

	useEffect(() => {
		if (activeCount > 0) {
			document.title = `🔵 (${activeCount}) Vigil`
		} else if (queuedCount > 0) {
			document.title = `🟡 [${queuedCount}] Vigil`
		} else {
			document.title = '⚫ Vigil'
		}
	}, [activeCount, queuedCount])

	const handleRetry = async (id: string) => {
		await api.retry(id)
		refresh()
	}

	const handleCancel = async (id: string) => {
		await api.cancel(id)
		refresh()
	}

	return (
		<div style={{ display: 'flex', flexDirection: 'column', height: '100vh' }}>
			<Header
				status={status}
				onPoll={() => api.triggerPoll().then(refresh)}
				onRefresh={refresh}
			/>
			<div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
				<TaskList
					tasks={tasks}
					status={status}
					selectedId={selectedTaskId}
					taskBaseUrl={config.taskBaseUrl}
					onSelect={selectTask}
					onRetry={handleRetry}
					onCancel={handleCancel}
				/>
				<main style={{ flex: 1, overflow: 'auto', padding: '32px 40px' }}>
					{selectedTask ? (
						<TaskDetail
							task={selectedTask}
							taskBaseUrl={config.taskBaseUrl}
							onRetry={() => handleRetry(selectedTask.id)}
							onCancel={() => handleCancel(selectedTask.id)}
							onSetStatus={async (status) => { await api.setStatus(selectedTask.id, status); refresh() }}
						/>
					) : (
						<EmptyState
							taskCount={tasks.length}
							activeCount={tasks.filter(t => t.status === 'processing').length}
						/>
					)}
				</main>
			</div>
		</div>
	)
}
