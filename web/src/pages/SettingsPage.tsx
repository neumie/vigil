import { useCallback, useEffect, useState } from 'react'
import { api } from '../api'

type Config = Record<string, unknown>

export function SettingsPage() {
	const [config, setConfig] = useState<Config | null>(null)
	const [saving, setSaving] = useState(false)
	const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

	useEffect(() => {
		api.configFull().then(setConfig).catch(err => {
			setMessage({ type: 'error', text: `Failed to load config: ${err.message}` })
		})
	}, [])

	const handleSave = useCallback(async () => {
		if (!config) return
		setSaving(true)
		setMessage(null)
		try {
			const result = await api.updateConfig(config)
			setMessage({ type: 'success', text: result.message })
		} catch (err) {
			setMessage({ type: 'error', text: err instanceof Error ? err.message : 'Save failed' })
		} finally {
			setSaving(false)
		}
	}, [config])

	const update = useCallback((path: string[], value: unknown) => {
		setConfig(prev => {
			if (!prev) return prev
			const next = structuredClone(prev)
			let obj: Record<string, unknown> = next
			for (let i = 0; i < path.length - 1; i++) {
				if (obj[path[i]] === undefined || obj[path[i]] === null) {
					obj[path[i]] = {}
				}
				obj = obj[path[i]] as Record<string, unknown>
			}
			obj[path[path.length - 1]] = value
			return next
		})
	}, [])

	if (!config) {
		return (
			<div style={{ padding: 40, color: 'var(--text-3)' }}>
				{message ? message.text : 'Loading config...'}
			</div>
		)
	}

	const provider = config.provider as Record<string, unknown> | undefined
	const projects = config.projects as Array<Record<string, unknown>> | undefined
	const polling = config.polling as Record<string, unknown> | undefined
	const solver = config.solver as Record<string, unknown> | undefined
	const server = config.server as Record<string, unknown> | undefined
	const github = config.github as Record<string, unknown> | undefined
	const chat = config.chat as Record<string, unknown> | undefined

	return (
		<div style={{ maxWidth: 640, margin: '0 auto', padding: '32px 24px' }}>
			<div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 32 }}>
				<div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
					<a href="/" style={{ color: 'var(--accent)', textDecoration: 'none', fontSize: 14 }}>
						&larr; Back
					</a>
					<h1 style={{ fontSize: 20, fontWeight: 600, color: 'var(--text-0)' }}>Settings</h1>
				</div>
				<button
					onClick={handleSave}
					disabled={saving}
					style={{
						padding: '6px 20px',
						background: 'var(--accent)',
						border: 'none',
						borderRadius: 'var(--radius-sm)',
						color: '#fff',
						cursor: saving ? 'wait' : 'pointer',
						fontSize: 13,
						fontFamily: 'var(--font-sans)',
						fontWeight: 500,
						opacity: saving ? 0.6 : 1,
					}}
				>
					{saving ? 'Saving...' : 'Save'}
				</button>
			</div>

			{message && (
				<div style={{
					padding: '10px 14px',
					marginBottom: 20,
					borderRadius: 'var(--radius-sm)',
					background: message.type === 'success' ? 'var(--green-dim)' : 'var(--red-dim)',
					color: message.type === 'success' ? 'var(--green)' : 'var(--red)',
					fontSize: 13,
				}}>
					{message.text}
				</div>
			)}

			{provider && (
				<Section title="Provider">
					<Field label="Type" value={String(provider.type ?? '')} onChange={v => update(['provider', 'type'], v)} />
					<Field label="API Base URL" value={String(provider.apiBaseUrl ?? '')} onChange={v => update(['provider', 'apiBaseUrl'], v)} />
					<Field label="Project Slug" value={String(provider.projectSlug ?? '')} onChange={v => update(['provider', 'projectSlug'], v)} />
					<Field label="API Token" value={String(provider.apiToken ?? '')} onChange={v => update(['provider', 'apiToken'], v)} type="password" />
					<Field label="Task Base URL" value={String(provider.taskBaseUrl ?? '')} onChange={v => update(['provider', 'taskBaseUrl'], v || undefined)} />
				</Section>
			)}

			<Section title="Projects">
				{(projects ?? []).map((p, i) => (
					<div key={i} style={{ padding: '12px 0', borderBottom: i < (projects?.length ?? 0) - 1 ? '1px solid var(--border)' : 'none' }}>
						<Field label="Slug" value={String(p.slug ?? '')} onChange={v => update(['projects', String(i), 'slug'], v)} />
						<Field label="Repo Path" value={String(p.repoPath ?? '')} onChange={v => update(['projects', String(i), 'repoPath'], v)} />
						<Field label="Base Branch" value={String(p.baseBranch ?? 'main')} onChange={v => update(['projects', String(i), 'baseBranch'], v)} />
						<Field label="Worktree Dir" value={String(p.worktreeDir ?? '')} onChange={v => update(['projects', String(i), 'worktreeDir'], v || undefined)} />
					</div>
				))}
			</Section>

			{polling && (
				<Section title="Polling">
					<Field label="Interval (seconds)" value={String(polling.intervalSeconds ?? 60)} onChange={v => update(['polling', 'intervalSeconds'], Number(v))} type="number" />
					<Field label="Since (ISO date)" value={String(polling.since ?? '')} onChange={v => update(['polling', 'since'], v || undefined)} />
				</Section>
			)}

			{solver && (
				<Section title="Solver">
					<Field label="Type" value={String(solver.type ?? 'default')} onChange={v => update(['solver', 'type'], v)} />
					<Field label="Concurrency" value={String(solver.concurrency ?? 2)} onChange={v => update(['solver', 'concurrency'], Number(v))} type="number" />
					<Field label="Model" value={String(solver.model ?? '')} onChange={v => update(['solver', 'model'], v || undefined)} />
					<Field label="Timeout (minutes)" value={String(solver.timeoutMinutes ?? 30)} onChange={v => update(['solver', 'timeoutMinutes'], Number(v))} type="number" />
					<Field label="Max Budget (USD)" value={String(solver.maxBudgetUsd ?? '')} onChange={v => update(['solver', 'maxBudgetUsd'], v ? Number(v) : undefined)} type="number" />
					<Field label="Transformer" value={String(solver.transformer ?? 'default')} onChange={v => update(['solver', 'transformer'], v)} />
				</Section>
			)}

			{server && (
				<Section title="Server">
					<Field label="Port" value={String(server.port ?? 7474)} onChange={v => update(['server', 'port'], Number(v))} type="number" />
					<Field label="Host" value={String(server.host ?? 'localhost')} onChange={v => update(['server', 'host'], v)} />
				</Section>
			)}

			{github && (
				<Section title="GitHub">
					<Toggle label="Create PRs" value={Boolean(github.createPrs ?? true)} onChange={v => update(['github', 'createPrs'], v)} />
					<Toggle label="Post Comments" value={Boolean(github.postComments ?? true)} onChange={v => update(['github', 'postComments'], v)} />
					<Field label="PR Prefix" value={String(github.prPrefix ?? '[Vigil]')} onChange={v => update(['github', 'prPrefix'], v)} />
				</Section>
			)}

			<Section title="Chat">
				<Toggle label="Enabled" value={Boolean(chat?.enabled)} onChange={v => update(['chat', 'enabled'], v)} />
				{Boolean(chat?.enabled) && (
					<>
						<Field label="Secret" value={String(chat?.secret ?? '')} onChange={v => update(['chat', 'secret'], v)} type="password" />
						<Field label="Base URL" value={String(chat?.baseUrl ?? '')} onChange={v => update(['chat', 'baseUrl'], v || undefined)} />
						<Toggle label="Tunnel" value={Boolean(chat?.tunnel)} onChange={v => update(['chat', 'tunnel'], v)} />
						<Field label="Expiry (days)" value={String(chat?.expiryDays ?? 7)} onChange={v => update(['chat', 'expiryDays'], Number(v))} type="number" />
						<Field label="Timeout (minutes)" value={String(chat?.timeoutMinutes ?? 120)} onChange={v => update(['chat', 'timeoutMinutes'], Number(v))} type="number" />
					</>
				)}
			</Section>
		</div>
	)
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
	return (
		<div style={{ marginBottom: 28 }}>
			<h2 style={{
				fontSize: 13,
				fontWeight: 600,
				color: 'var(--text-2)',
				marginBottom: 12,
				paddingBottom: 8,
				borderBottom: '1px solid var(--border)',
				textTransform: 'uppercase',
				letterSpacing: '0.04em',
			}}>
				{title}
			</h2>
			{children}
		</div>
	)
}

function Field({ label, value, onChange, type = 'text' }: {
	label: string
	value: string
	onChange: (v: string) => void
	type?: 'text' | 'password' | 'number'
}) {
	return (
		<div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
			<label style={{ fontSize: 12, color: 'var(--text-3)', width: 140, flexShrink: 0 }}>{label}</label>
			<input
				type={type}
				value={value}
				onChange={e => onChange(e.target.value)}
				style={{
					flex: 1,
					padding: '5px 8px',
					background: 'var(--bg-0)',
					border: '1px solid var(--border)',
					borderRadius: 'var(--radius-sm)',
					color: 'var(--text-1)',
					fontSize: 12,
					fontFamily: type === 'number' ? 'var(--font-mono)' : 'var(--font-sans)',
					outline: 'none',
				}}
			/>
		</div>
	)
}

function Toggle({ label, value, onChange }: {
	label: string
	value: boolean
	onChange: (v: boolean) => void
}) {
	return (
		<div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
			<label style={{ fontSize: 12, color: 'var(--text-3)', width: 140, flexShrink: 0 }}>{label}</label>
			<button
				onClick={() => onChange(!value)}
				style={{
					width: 36,
					height: 20,
					borderRadius: 10,
					border: 'none',
					cursor: 'pointer',
					background: value ? 'var(--accent)' : 'var(--bg-3)',
					position: 'relative',
					transition: 'background 150ms',
				}}
			>
				<span style={{
					position: 'absolute',
					top: 2,
					left: value ? 18 : 2,
					width: 16,
					height: 16,
					borderRadius: '50%',
					background: '#fff',
					transition: 'left 150ms',
				}} />
			</button>
		</div>
	)
}
