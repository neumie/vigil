import { useCallback, useEffect, useState, useSyncExternalStore } from 'react'

export type DashboardSelection = { kind: 'task' | 'item'; id: string } | null

/** Read selected dashboard entity from URL hash: #task/{id} or #item/{id}. */
function getHashSelectionKey(): string {
	const hash = window.location.hash
	const match = hash.match(/^#(task|item)\/(.+)$/)
	return match ? `${match[1]}/${match[2]}` : ''
}

function subscribeHash(cb: () => void) {
	window.addEventListener('hashchange', cb)
	return () => window.removeEventListener('hashchange', cb)
}

export function useHashRoute() {
	const selectionKey = useSyncExternalStore(subscribeHash, getHashSelectionKey)
	const selection = parseSelection(selectionKey)

	const selectTask = useCallback((id: string | null) => {
		window.location.hash = id ? `task/${id}` : ''
	}, [])

	const selectItem = useCallback((id: string | null) => {
		window.location.hash = id ? `item/${id}` : ''
	}, [])

	return { selection, selectTask, selectItem }
}

function parseSelection(key: string): DashboardSelection {
	const match = key.match(/^(task|item)\/(.+)$/)
	if (!match) return null
	return { kind: match[1] as 'task' | 'item', id: match[2] }
}

export function useInterval(callback: () => void, ms: number) {
	useEffect(() => {
		callback()
		const id = setInterval(callback, ms)
		return () => clearInterval(id)
	}, [callback, ms])
}

export function useRelativeTime(date: string | null) {
	const [, setTick] = useState(0)
	useEffect(() => {
		if (!date) return
		const id = setInterval(() => setTick(t => t + 1), 1000)
		return () => clearInterval(id)
	}, [date])

	if (!date) return null
	const ms = Date.now() - new Date(date).getTime()
	const s = Math.floor(ms / 1000)
	if (s < 60) return `${s}s`
	const m = Math.floor(s / 60)
	if (m < 60) return `${m}m ${s % 60}s`
	const h = Math.floor(m / 60)
	return `${h}h ${m % 60}m`
}
