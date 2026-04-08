# Settings Page & Project Filter Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a settings page that edits the full config (persisted to disk), and a project filter in the sidebar that works with multiple projects.

**Architecture:** Backend gets two new endpoints: `GET /api/config/full` returns raw config, `PUT /api/config` validates with Zod and writes to `vigil.config.json`. Frontend gets a `/settings` route with form sections for each config group, and a project filter dropdown above the sidebar tabs. Config path is tracked so writes go back to the same file.

**Tech Stack:** Hono API, React 19, Zod validation, inline styles (existing pattern)

---

### Task 1: Backend — expose config path and full config read endpoint

**Files:**
- Modify: `src/config.ts` — export resolved config path
- Modify: `src/server/routes/api.ts` — add `GET /api/config/full`

- [ ] **Step 1: Export config path from loadConfig**

In `src/config.ts`, change `loadConfig` to also return the resolved path:

```typescript
export function loadConfig(configPath?: string): { config: VigilConfig; configPath: string } {
	const path = configPath ?? process.env.VIGIL_CONFIG ?? resolve(process.cwd(), 'vigil.config.json')
	const raw = readFileSync(path, 'utf-8')
	const json = JSON.parse(raw)
	return { config: configSchema.parse(json), configPath: path }
}
```

- [ ] **Step 2: Update all loadConfig call sites**

In `src/index.ts`, change:
```typescript
const { config, configPath } = loadConfig()
```

In `src/cli/vigil.ts` run handler, change:
```typescript
const { config } = loadConfig()
```

- [ ] **Step 3: Pass configPath to createApp**

In `src/server/app.ts`, update signature:
```typescript
export function createApp(config: VigilConfig, configPath: string, db: DB, queue: TaskQueue, poller: Poller, provider: TaskProvider) {
```

Pass `configPath` to `apiRoutes`:
```typescript
app.route('/api', apiRoutes(config, configPath, db, queue, poller))
```

In `src/index.ts`, pass `configPath`:
```typescript
const app = createApp(config, configPath, db, queue, poller, provider)
```

- [ ] **Step 4: Add GET /api/config/full endpoint**

In `src/server/routes/api.ts`, update signature and add endpoint:

```typescript
import { readFileSync } from 'node:fs'

export function apiRoutes(config: VigilConfig, configPath: string, db: DB, queue: TaskQueue, poller: Poller) {
```

Add endpoint after existing `/config`:
```typescript
	// Full config (for settings page)
	api.get('/config/full', c => {
		try {
			const raw = readFileSync(configPath, 'utf-8')
			return c.json({ data: JSON.parse(raw) })
		} catch (err) {
			return c.json({ error: 'Failed to read config file' }, 500)
		}
	})
```

- [ ] **Step 5: Build and verify**

Run: `npm run build`
Expected: Compiles without errors

- [ ] **Step 6: Commit**

```bash
git add src/config.ts src/index.ts src/cli/vigil.ts src/server/app.ts src/server/routes/api.ts
git commit -m "feat: expose config path and full config read endpoint"
```

---

### Task 2: Backend — config write endpoint with Zod validation

**Files:**
- Modify: `src/config.ts` — export the schema for validation
- Modify: `src/server/routes/api.ts` — add `PUT /api/config`

- [ ] **Step 1: Export configSchema from config.ts**

In `src/config.ts`, add `export` to the schema:
```typescript
export const configSchema = z.object({
```

- [ ] **Step 2: Add PUT /api/config endpoint**

In `src/server/routes/api.ts`, add import and endpoint:

```typescript
import { writeFileSync } from 'node:fs'
import { configSchema } from '../../config.js'
```

```typescript
	// Update config (validates and writes to disk)
	api.put('/config', async c => {
		const body = await c.req.json()
		const result = configSchema.safeParse(body)
		if (!result.success) {
			return c.json({ error: 'Validation failed', details: result.error.flatten() }, 400)
		}
		try {
			writeFileSync(configPath, JSON.stringify(body, null, '\t'), 'utf-8')
			return c.json({ data: { message: 'Config saved. Restart Vigil for changes to take effect.' } })
		} catch (err) {
			return c.json({ error: `Failed to write config: ${err instanceof Error ? err.message : err}` }, 500)
		}
	})
```

- [ ] **Step 3: Build and verify**

Run: `npm run build`
Expected: Compiles without errors

- [ ] **Step 4: Commit**

```bash
git add src/config.ts src/server/routes/api.ts
git commit -m "feat: add PUT /api/config endpoint with Zod validation"
```

---

### Task 3: Frontend — API client, routing, and settings page scaffold

**Files:**
- Modify: `web/src/api.ts` — add config types and API methods
- Modify: `web/src/main.tsx` — add `/settings` route
- Create: `web/src/pages/SettingsPage.tsx` — settings page component

- [ ] **Step 1: Add API methods to web/src/api.ts**

Add a `putJSON` helper and the new methods:

```typescript
async function putJSON<T>(path: string, body: unknown): Promise<T> {
	const res = await fetch(`${BASE}${path}`, {
		method: 'PUT',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify(body),
	})
	const json = await res.json()
	if (!res.ok) throw new Error(json.error ?? `API error: ${res.status}`)
	return json.data
}
```

Add to the `api` object:

```typescript
	configFull: () => fetchJSON<Record<string, unknown>>('/config/full'),
	updateConfig: (config: Record<string, unknown>) => putJSON<{ message: string }>('/config', config),
```

- [ ] **Step 2: Add /settings route to main.tsx**

```typescript
import { createRoot } from 'react-dom/client'
import { App } from './App'
import { ChatPage } from './pages/ChatPage'
import { SettingsPage } from './pages/SettingsPage'

function Root() {
	const path = window.location.pathname
	const chatMatch = path.match(/^\/chat\/(.+)$/)

	if (chatMatch) {
		return <ChatPage token={chatMatch[1]} />
	}

	if (path === '/settings') {
		return <SettingsPage />
	}

	return <App />
}

createRoot(document.getElementById('root')!).render(<Root />)
```

- [ ] **Step 3: Create SettingsPage scaffold**

Create `web/src/pages/SettingsPage.tsx`:

```tsx
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

			{/* Provider */}
			{provider && (
				<Section title="Provider">
					<Field label="Type" value={String(provider.type ?? '')} onChange={v => update(['provider', 'type'], v)} />
					<Field label="API Base URL" value={String(provider.apiBaseUrl ?? '')} onChange={v => update(['provider', 'apiBaseUrl'], v)} />
					<Field label="Project Slug" value={String(provider.projectSlug ?? '')} onChange={v => update(['provider', 'projectSlug'], v)} />
					<Field label="API Token" value={String(provider.apiToken ?? '')} onChange={v => update(['provider', 'apiToken'], v)} type="password" />
					<Field label="Task Base URL" value={String(provider.taskBaseUrl ?? '')} onChange={v => update(['provider', 'taskBaseUrl'], v || undefined)} />
				</Section>
			)}

			{/* Projects */}
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

			{/* Polling */}
			{polling && (
				<Section title="Polling">
					<Field label="Interval (seconds)" value={String(polling.intervalSeconds ?? 60)} onChange={v => update(['polling', 'intervalSeconds'], Number(v))} type="number" />
					<Field label="Since (ISO date)" value={String(polling.since ?? '')} onChange={v => update(['polling', 'since'], v || undefined)} />
				</Section>
			)}

			{/* Solver */}
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

			{/* Server */}
			{server && (
				<Section title="Server">
					<Field label="Port" value={String(server.port ?? 7474)} onChange={v => update(['server', 'port'], Number(v))} type="number" />
					<Field label="Host" value={String(server.host ?? 'localhost')} onChange={v => update(['server', 'host'], v)} />
				</Section>
			)}

			{/* GitHub */}
			{github && (
				<Section title="GitHub">
					<Toggle label="Create PRs" value={Boolean(github.createPrs ?? true)} onChange={v => update(['github', 'createPrs'], v)} />
					<Toggle label="Post Comments" value={Boolean(github.postComments ?? true)} onChange={v => update(['github', 'postComments'], v)} />
					<Field label="PR Prefix" value={String(github.prPrefix ?? '[Vigil]')} onChange={v => update(['github', 'prPrefix'], v)} />
				</Section>
			)}

			{/* Chat */}
			<Section title="Chat">
				<Toggle label="Enabled" value={Boolean(chat?.enabled)} onChange={v => update(['chat', 'enabled'], v)} />
				{chat?.enabled && (
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
```

- [ ] **Step 4: Build and verify**

Run: `npm run build && npm run build:web`
Expected: Both compile without errors

- [ ] **Step 5: Commit**

```bash
git add web/src/api.ts web/src/main.tsx web/src/pages/SettingsPage.tsx
git commit -m "feat: add settings page with full config editor"
```

---

### Task 4: Frontend — settings link in header

**Files:**
- Modify: `web/src/components/Header.tsx` — add settings link

- [ ] **Step 1: Add settings link to header**

In `web/src/components/Header.tsx`, add a settings link between the title and the buttons:

```tsx
<div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
	<a href="/settings" style={{
		padding: '5px 12px',
		color: 'var(--text-2)',
		textDecoration: 'none',
		fontSize: 12,
		fontWeight: 500,
	}}>
		Settings
	</a>
	<HeaderButton onClick={onTogglePause} active={!paused}>
		{paused ? 'Start' : 'Running'}
	</HeaderButton>
	<HeaderButton onClick={onPoll}>Poll</HeaderButton>
	<HeaderButton onClick={onRefresh}>Refresh</HeaderButton>
</div>
```

- [ ] **Step 2: Build and verify**

Run: `npm run build:web`
Expected: Compiles without errors

- [ ] **Step 3: Commit**

```bash
git add web/src/components/Header.tsx
git commit -m "feat: add settings link to header"
```

---

### Task 5: Frontend — project filter in sidebar

**Files:**
- Modify: `web/src/components/TaskList.tsx` — add project filter dropdown
- Modify: `web/src/App.tsx` — pass project list, manage filter state

- [ ] **Step 1: Add project filter state to App.tsx**

Add state and pass to TaskList:

```tsx
const [projectFilter, setProjectFilter] = useState<string | null>(null)

const filteredTasks = projectFilter
	? tasks.filter(t => t.projectSlug === projectFilter)
	: tasks

const projectSlugs = [...new Set(tasks.map(t => t.projectSlug))]
```

Pass to TaskList:
```tsx
<TaskList
	tasks={filteredTasks}
	status={status}
	selectedId={selectedTaskId}
	taskBaseUrl={config.taskBaseUrl}
	onSelect={selectTask}
	onRetry={handleRetry}
	onCancel={handleCancel}
	onSkip={async (id) => { await api.setStatus(id, 'skipped'); refresh() }}
	projects={projectSlugs}
	selectedProject={projectFilter}
	onProjectChange={setProjectFilter}
/>
```

- [ ] **Step 2: Add project filter to TaskList**

Add props to the `Props` interface:
```typescript
interface Props {
	tasks: TaskRecord[]
	status: DaemonStatus | null
	selectedId: string | null
	taskBaseUrl?: string
	onSelect: (id: string | null) => void
	onRetry: (id: string) => void
	onCancel: (id: string) => void
	onSkip: (id: string) => void
	projects: string[]
	selectedProject: string | null
	onProjectChange: (slug: string | null) => void
}
```

Add the filter dropdown between the aside opening and the tabs div (only show when there are 2+ projects):

```tsx
{/* Project filter */}
{projects.length > 1 && (
	<div style={{
		padding: '8px 12px',
		borderBottom: '1px solid var(--border)',
	}}>
		<select
			value={selectedProject ?? ''}
			onChange={e => onProjectChange(e.target.value || null)}
			style={{
				width: '100%',
				padding: '5px 8px',
				background: 'var(--bg-0)',
				border: '1px solid var(--border)',
				borderRadius: 'var(--radius-sm)',
				color: 'var(--text-1)',
				fontSize: 12,
				fontFamily: 'var(--font-sans)',
				outline: 'none',
				cursor: 'pointer',
			}}
		>
			<option value="">All projects</option>
			{projects.map(p => (
				<option key={p} value={p}>{p}</option>
			))}
		</select>
	</div>
)}
```

- [ ] **Step 3: Build and verify**

Run: `npm run build:web`
Expected: Compiles without errors

- [ ] **Step 4: Commit**

```bash
git add web/src/App.tsx web/src/components/TaskList.tsx
git commit -m "feat: add project filter dropdown in sidebar"
```

---

### Task 6: Verification

- [ ] **Step 1: Full build**

Run: `npm run build && npm run build:web`
Expected: Both compile clean

- [ ] **Step 2: Manual testing checklist**

Start vigil: `npm run dev`

1. Open dashboard at `http://localhost:7474`
2. Click "Settings" in header — navigates to `/settings`
3. All config sections are populated from `vigil.config.json`
4. Edit a value (e.g. poll interval) and click Save — see success message
5. Check `vigil.config.json` on disk — value is updated
6. Enter invalid value (e.g. empty apiToken) and save — see validation error
7. Click "Back" — returns to dashboard
8. If multiple projects configured, project filter dropdown appears above tabs
9. Selecting a project filters all three tabs (active/queued/archived)
10. Selecting "All projects" shows everything
