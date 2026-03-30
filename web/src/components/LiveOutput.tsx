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

	useEffect(() => {
		if (containerRef.current) {
			containerRef.current.scrollTop = containerRef.current.scrollHeight
		}
	}, [output])

	if (!output && !isActive) return <p style={{ color: 'var(--text-4)', fontSize: 13 }}>No output captured.</p>

	return (
		<pre
			ref={containerRef}
			style={{
				background: 'var(--bg-0)',
				borderRadius: 'var(--radius-sm)',
				padding: 12,
				fontSize: 11,
				fontFamily: 'var(--font-mono)',
				color: 'var(--text-2)',
				maxHeight: 500,
				overflow: 'auto',
				whiteSpace: 'pre-wrap',
				wordBreak: 'break-word',
				margin: 0,
				lineHeight: 1.6,
			}}
		>
			{output || (isActive ? 'Waiting for output...' : '')}
			{isActive && !done && <span style={{ color: 'var(--accent)', animation: 'blink 1s step-end infinite' }}>|</span>}
		</pre>
	)
}
