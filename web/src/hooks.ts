import { useCallback, useEffect, useState, useSyncExternalStore } from 'react'

/** Read task ID from URL hash: #task/{id} */
function getHashTaskId(): string | null {
	const hash = window.location.hash
	const match = hash.match(/^#task\/(.+)$/)
	return match ? match[1] : null
}

function subscribeHash(cb: () => void) {
	window.addEventListener('hashchange', cb)
	return () => window.removeEventListener('hashchange', cb)
}

export function useHashRoute() {
	const taskId = useSyncExternalStore(subscribeHash, getHashTaskId)

	const selectTask = useCallback((id: string | null) => {
		window.location.hash = id ? `task/${id}` : ''
	}, [])

	return { selectedTaskId: taskId, selectTask }
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
