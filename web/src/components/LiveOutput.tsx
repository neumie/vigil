import { useEffect, useRef, useState } from 'react'
import { api } from '../api'

export function LiveOutput({ taskId, isActive }: { taskId: string; isActive: boolean }) {
	const [output, setOutput] = useState('')
	const offsetRef = useRef(0)
	const [done, setDone] = useState(false)
	const containerRef = useRef<HTMLPreElement>(null)

	useEffect(() => {
		if (done && !isActive) return

		const poll = async () => {
			try {
				const result = await api.output(taskId, offsetRef.current)
				if (result.content) {
					setOutput(prev => prev + result.content)
					offsetRef.current = result.offset
				}
				if (result.done) setDone(true)
			} catch {
				/* ignore */
			}
		}

		poll()
		const interval = setInterval(poll, 2000)
		return () => clearInterval(interval)
	}, [taskId, done, isActive])

	// Auto-scroll to bottom
	useEffect(() => {
		if (containerRef.current) {
			containerRef.current.scrollTop = containerRef.current.scrollHeight
		}
	}, [output])

	if (!output && !isActive) return null

	return (
		<pre
			ref={containerRef}
			style={{
				background: '#0a0a0a',
				borderRadius: 6,
				padding: 12,
				fontSize: 12,
				fontFamily: 'monospace',
				color: '#d4d4d8',
				maxHeight: 400,
				overflow: 'auto',
				whiteSpace: 'pre-wrap',
				wordBreak: 'break-word',
				margin: 0,
			}}
		>
			{output || (isActive ? 'Waiting for output...' : '')}
			{isActive && !done && <span style={{ color: '#3b82f6', animation: 'blink 1s infinite' }}>|</span>}
		</pre>
	)
}
