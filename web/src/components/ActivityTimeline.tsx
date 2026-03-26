import { useEffect, useState } from 'react'
import { type EventEntry, api } from '../api'

const eventIcons: Record<string, string> = {
	task_discovered: '>>',
	task_queued: '[]',
	solver_started: '>>',
	solver_completed: 'OK',
	solver_failed: '!!',
	pr_created: 'PR',
	comment_posted: '--',
	action_completed: 'OK',
	claude_file_read: '..',
	claude_edit: '~~',
	claude_command: '$>',
	claude_assessment: '??',
	claude_error: '!!',
	claude_tool_call: '()',
}

const eventColors: Record<string, string> = {
	task_discovered: '#71717a',
	task_queued: '#71717a',
	solver_started: '#3b82f6',
	solver_completed: '#22c55e',
	solver_failed: '#ef4444',
	pr_created: '#a78bfa',
	comment_posted: '#71717a',
	action_completed: '#22c55e',
	claude_file_read: '#52525b',
	claude_edit: '#f59e0b',
	claude_command: '#3b82f6',
	claude_assessment: '#a78bfa',
	claude_error: '#ef4444',
	claude_tool_call: '#71717a',
}

export function ActivityTimeline({ taskId }: { taskId: string }) {
	const [events, setEvents] = useState<EventEntry[]>([])

	useEffect(() => {
		api.taskEvents(taskId).then(setEvents).catch(console.error)
	}, [taskId])

	if (events.length === 0) {
		return <p style={{ color: '#71717a', padding: 8 }}>No events recorded.</p>
	}

	return (
		<div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
			{events.map(event => {
				const payload = event.payload ? JSON.parse(event.payload) : null
				const icon = eventIcons[event.eventType] ?? '>>'
				const color = eventColors[event.eventType] ?? '#71717a'
				const time = event.createdAt.slice(11, 19)
				const label = formatEvent(event.eventType, payload)

				return (
					<div
						key={event.id}
						style={{
							display: 'flex',
							alignItems: 'flex-start',
							gap: 8,
							padding: '4px 0',
							fontSize: 13,
						}}
					>
						<span style={{ color: '#52525b', fontFamily: 'monospace', width: 56, flexShrink: 0 }}>{time}</span>
						<span style={{ color, fontFamily: 'monospace', width: 24, flexShrink: 0, textAlign: 'center' }}>{icon}</span>
						<span style={{ color: '#d4d4d8' }}>{label}</span>
					</div>
				)
			})}
		</div>
	)
}

function formatEvent(type: string, payload: Record<string, unknown> | null): string {
	if (!payload) return type.replace(/_/g, ' ')

	switch (type) {
		case 'task_discovered':
			return `Discovered: ${payload.title ?? '?'}`
		case 'solver_completed':
			return `Assessment: ${payload.tier} (confidence: ${payload.confidence})`
		case 'solver_failed':
			return `Failed (${payload.phase ?? '?'}): ${payload.error ?? '?'}`
		case 'pr_created':
			return `PR created${payload.draft ? ' (draft)' : ''}: ${payload.url ?? '?'}`
		case 'claude_file_read':
		case 'claude_edit':
		case 'claude_command':
		case 'claude_tool_call':
			return String(payload.detail ?? type)
		default:
			return type.replace(/_/g, ' ')
	}
}
