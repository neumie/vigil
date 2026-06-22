import { useCallback, useEffect, useState } from 'react'
import {
	type AppConfig,
	type DaemonStatus,
	type DashboardActionId,
	type DashboardItem,
	type PlanInfo,
	type TaskRecord,
	api,
} from './api'
import { EmptyState } from './components/EmptyState'
import { Header } from './components/Header'
import { ItemCreateForm } from './components/ItemCreateForm'
import { ItemDetail } from './components/ItemDetail'
import { TaskDetail } from './components/TaskDetail'
import { TaskList, workAttentionCounts } from './components/TaskList'
import { useHashRoute, useInterval } from './hooks'

export function App() {
	const [status, setStatus] = useState<DaemonStatus | null>(null)
	const [tasks, setTasks] = useState<TaskRecord[]>([])
	const [items, setItems] = useState<DashboardItem[]>([])
	const [config, setConfig] = useState<AppConfig>({})
	const { selection, selectTask, selectItem } = useHashRoute()
	const [projectFilter, setProjectFilter] = useState<string | null>(null)
	const [createDraft, setCreateDraft] = useState<{ forkFrom?: DashboardItem } | null>(null)

	const refresh = useCallback(async () => {
		try {
			const [s, i, t, c] = await Promise.all([api.status(), api.items(), api.tasks(), api.config()])
			setStatus(s)
			setItems(i)
			setTasks(t)
			const projectColors: Record<string, string> = {}
			for (const p of c.projects ?? []) {
				if (p.color) projectColors[p.slug] = p.color
			}
			setConfig({ ...c, projectColors })
		} catch (err) {
			console.error('Failed to refresh:', err)
		}
	}, [])

	useInterval(refresh, 5000)

	const filteredTasks = projectFilter ? tasks.filter(t => t.projectSlug === projectFilter) : tasks
	const filteredItems = projectFilter ? items.filter(i => i.projectSlug === projectFilter) : items

	const projectSlugs = [...new Set([...items.map(i => i.projectSlug), ...tasks.map(t => t.projectSlug)])]

	const selectedTaskId = selection?.kind === 'task' ? selection.id : null
	const selectedItemId = selection?.kind === 'item' ? selection.id : null
	const selectedTask = selectedTaskId ? (tasks.find(t => t.id === selectedTaskId) ?? null) : null
	const selectedItem = selectedItemId ? (items.find(i => i.id === selectedItemId) ?? null) : null
	const { running: runningCount, waiting: waitingCount } = workAttentionCounts(tasks, items)

	useEffect(() => {
		if (runningCount > 0) {
			document.title = `🔵 (${runningCount}) Vigil`
		} else if (waitingCount > 0) {
			document.title = `🟡 [${waitingCount}] Vigil`
		} else {
			document.title = '⚫ Vigil'
		}
	}, [runningCount, waitingCount])

	const handleRetry = async (id: string) => {
		await api.retry(id)
		refresh()
	}

	const handleCancel = async (id: string) => {
		await api.cancel(id)
		refresh()
	}

	const handleItemAction = async (id: string, action: DashboardActionId) => {
		await api.itemAction(id, action)
		refresh()
	}

	const handlePlanItem = async (id: string): Promise<PlanInfo> => {
		const info = await api.planItem(id)
		await refresh()
		return info
	}

	const handleCreatedItem = async (created: DashboardItem | DashboardItem[]) => {
		const first = Array.isArray(created) ? created[0] : created
		setCreateDraft(null)
		await refresh()
		if (first) selectItem(first.id)
	}

	const selectExistingTask = (id: string | null) => {
		setCreateDraft(null)
		selectTask(id)
	}

	const selectExistingItem = (id: string | null) => {
		setCreateDraft(null)
		selectItem(id)
	}

	return (
		<div style={{ display: 'flex', flexDirection: 'column', height: '100vh' }}>
			<Header
				status={status}
				onNewItem={() => {
					setCreateDraft({})
					selectTask(null)
				}}
				onPoll={() => api.triggerPoll().then(refresh)}
				onTogglePause={() => {
					const action = status?.queue.paused ? api.resumeQueue : api.pauseQueue
					action().then(refresh)
				}}
			/>
			<div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
				<TaskList
					tasks={filteredTasks}
					items={filteredItems}
					status={status}
					selectedTaskId={selectedTaskId}
					selectedItemId={selectedItemId}
					onSelectTask={selectExistingTask}
					onSelectItem={selectExistingItem}
					projects={projectSlugs}
					selectedProject={projectFilter}
					onProjectChange={setProjectFilter}
					projectColors={config.projectColors ?? {}}
				/>
				<main style={{ flex: 1, overflow: 'auto', padding: '32px 40px' }}>
					{createDraft ? (
						<ItemCreateForm
							projects={config.projects ?? []}
							spawnerAdapters={config.spawnerAdapters ?? []}
							forkFrom={createDraft.forkFrom ?? null}
							onCreated={handleCreatedItem}
							onCancel={() => setCreateDraft(null)}
						/>
					) : selectedItem ? (
						<ItemDetail
							item={selectedItem}
							onAction={handleItemAction}
							onPlan={handlePlanItem}
							onFork={item => {
								setCreateDraft({ forkFrom: item })
								selectTask(null)
							}}
						/>
					) : selectedTask ? (
						<TaskDetail
							task={selectedTask}
							taskBaseUrl={config.taskBaseUrl}
							onStart={async () => {
								await api.start(selectedTask.id)
								refresh()
							}}
							onRetry={() => handleRetry(selectedTask.id)}
							onCancel={() => handleCancel(selectedTask.id)}
							onSetStatus={async status => {
								await api.setStatus(selectedTask.id, status)
								refresh()
							}}
							onDelete={async () => {
								await api.deleteTask(selectedTask.id)
								selectTask(null)
								refresh()
							}}
						/>
					) : (
						<EmptyState taskCount={tasks.length + items.length} activeCount={runningCount} />
					)}
				</main>
			</div>
		</div>
	)
}
