export function EmptyState({ taskCount, activeCount }: { taskCount: number; activeCount: number }) {
	return (
		<div style={{
			display: 'flex',
			flexDirection: 'column',
			alignItems: 'center',
			justifyContent: 'center',
			height: '100%',
			gap: 12,
			color: 'var(--text-4)',
		}}>
			<div style={{ fontSize: 40, opacity: 0.3 }}>&#9678;</div>
			{taskCount === 0 ? (
				<>
					<p style={{ fontSize: 15, color: 'var(--text-3)' }}>No tasks yet</p>
					<p style={{ fontSize: 13 }}>Vigil is polling for new tasks. They'll appear here when discovered.</p>
				</>
			) : activeCount > 0 ? (
				<>
					<p style={{ fontSize: 15, color: 'var(--text-3)' }}>{activeCount} task{activeCount > 1 ? 's' : ''} processing</p>
					<p style={{ fontSize: 13 }}>Select a task from the sidebar to view details.</p>
				</>
			) : (
				<>
					<p style={{ fontSize: 15, color: 'var(--text-3)' }}>Select a task</p>
					<p style={{ fontSize: 13 }}>Click a task in the sidebar to view its details and output.</p>
				</>
			)}
		</div>
	)
}
