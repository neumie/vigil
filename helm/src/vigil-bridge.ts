// VigilBridge — the ONE place helm talks HTTP to the vigil daemon.
//
// The renderer is a file:// document, so it cannot fetch :7474 directly (CORS,
// private-network access). Instead the main process runs a single poller and
// proxies commands:
//
//   - Poll loop (2.5s): GET /api/status + GET /api/items (+ GET /api/config
//     once, refreshed after a config save). The merged VigilSnapshot is pushed
//     to every window over 'vigil:snapshot' — full snapshot, only when the
//     JSON actually changed (no delta protocol).
//   - Commands: invoke channels that proxy one HTTP call each and return the
//     daemon's `{ data } | { error }` envelope verbatim.
//
// The bridge holds no business logic: status/action rules stay server-owned.

import { BrowserWindow, ipcMain } from 'electron'
import type {
	AiPass,
	AppConfig,
	DaemonStatus,
	DashboardActionId,
	DashboardItem,
	ItemStatus,
	VigilResult,
	VigilSnapshot,
} from './shared-vigil'

const POLL_MS = 2500
const REQUEST_TIMEOUT_MS = 10_000

const ITEM_ACTIONS: ReadonlySet<string> = new Set(['approve', 'reject', 'start', 'cancel', 'retry', 'reopen'])
const AI_PASSES: ReadonlySet<string> = new Set(['display-name', 'branch-name', 'assess'])

function errorMessage(err: unknown): string {
	return err instanceof Error ? err.message : String(err)
}

export class VigilBridge {
	private readonly baseUrl: string
	private snapshot: VigilSnapshot = { reachable: false, status: null, items: null, config: null }
	/** Serialized snapshot with volatile fields dropped; push only when this changes. */
	private lastComparable = ''
	private timer: NodeJS.Timeout | null = null
	private ticking = false

	constructor(daemonUrl: string) {
		this.baseUrl = daemonUrl.replace(/\/$/, '')
	}

	start(): void {
		if (this.timer) return
		void this.tick()
		this.timer = setInterval(() => void this.tick(), POLL_MS)
	}

	stop(): void {
		if (this.timer) clearInterval(this.timer)
		this.timer = null
	}

	getSnapshot(): VigilSnapshot {
		return this.snapshot
	}

	// --- polling ---------------------------------------------------------------

	private async tick(): Promise<void> {
		if (this.ticking) return // a slow daemon must not stack overlapping polls
		this.ticking = true
		try {
			const [status, items] = await Promise.all([
				this.request<DaemonStatus>('GET', '/status'),
				this.request<DashboardItem[]>('GET', '/items'),
			])
			const reachable = status.error === undefined
			// Config is fetched once (first reachable tick), then only on demand
			// (refreshConfig after a save) — it changes through helm itself.
			let config = this.snapshot.config
			if (reachable && config === null) {
				config = (await this.request<AppConfig>('GET', '/config')).data ?? null
			}
			// Keep last-known data through an outage — the dot reports unreachable,
			// the list must not blank out.
			this.snapshot = {
				reachable,
				status: status.data ?? this.snapshot.status,
				items: items.data ?? this.snapshot.items,
				config,
			}
			this.publish()
		} finally {
			this.ticking = false
		}
	}

	/** Immediate re-poll after a mutating command so the UI catches up before the next interval. */
	private kick(): void {
		void this.tick()
	}

	private async refreshConfig(): Promise<void> {
		const config = await this.request<AppConfig>('GET', '/config')
		if (config.data !== undefined) {
			this.snapshot = { ...this.snapshot, config: config.data }
			this.publish()
		}
	}

	private publish(): void {
		// `status.uptime` advances every poll; diffing on it would push every tick.
		const { status, ...rest } = this.snapshot
		const comparable = JSON.stringify({ ...rest, status: status ? { ...status, uptime: 0 } : null })
		if (comparable === this.lastComparable) return
		this.lastComparable = comparable
		for (const win of BrowserWindow.getAllWindows()) {
			if (!win.webContents.isDestroyed()) win.webContents.send('vigil:snapshot', this.snapshot)
		}
	}

	// --- HTTP proxy ------------------------------------------------------------

	private async request<T>(method: 'GET' | 'POST' | 'PUT', path: string, body?: unknown): Promise<VigilResult<T>> {
		try {
			const res = await fetch(`${this.baseUrl}/api${path}`, {
				method,
				headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
				body: body === undefined ? undefined : JSON.stringify(body),
				signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
			})
			const json = (await res.json().catch(() => ({}))) as { data?: T; error?: string }
			// Daemon envelope passed through verbatim; a non-ok status without an
			// `error` body still needs a message for the UI.
			if (!res.ok) return { error: json.error ?? `API error: ${res.status}` }
			return { data: json.data as T }
		} catch (err) {
			return { error: errorMessage(err) }
		}
	}

	// --- IPC surface -------------------------------------------------------------

	registerIpc(): void {
		// Channel args cross the context bridge from renderer code — validate the
		// path-building ones (id via encodeURIComponent, action/pass/status by
		// allowlist) so a compromised renderer can't hit arbitrary daemon routes.
		const id = (raw: unknown): string => encodeURIComponent(String(raw))

		ipcMain.handle('vigil:subscribe', () => this.snapshot)

		ipcMain.handle('vigil:item', (_e, rawId: unknown) => this.request('GET', `/items/${id(rawId)}`))

		ipcMain.handle('vigil:itemAction', async (_e, rawId: unknown, action: DashboardActionId, body?: unknown) => {
			if (!ITEM_ACTIONS.has(action)) return { error: `Unknown item action: ${String(action)}` }
			const result = await this.request('POST', `/items/${id(rawId)}/${action}`, body ?? {})
			this.kick()
			return result
		})

		ipcMain.handle('vigil:plan', async (_e, rawId: unknown, body?: unknown) => {
			const result = await this.request('POST', `/items/${id(rawId)}/plan`, body ?? {})
			this.kick()
			return result
		})

		ipcMain.handle('vigil:aiPass', async (_e, rawId: unknown, pass: AiPass) => {
			if (!AI_PASSES.has(pass)) return { error: `Unknown AI pass: ${String(pass)}` }
			const result = await this.request('POST', `/items/${id(rawId)}/ai/${pass}`)
			this.kick()
			return result
		})

		ipcMain.handle('vigil:createItem', async (_e, body: unknown) => {
			const result = await this.request('POST', '/items', body)
			this.kick()
			return result
		})

		ipcMain.handle('vigil:sourceTask', async (_e, rawId: unknown) => {
			const result = await this.request('POST', `/items/${id(rawId)}/source-task`)
			this.kick()
			return result
		})

		ipcMain.handle('vigil:setStatus', async (_e, rawId: unknown, status: ItemStatus) => {
			const result = await this.request('POST', `/items/${id(rawId)}/status`, { status })
			this.kick()
			return result
		})

		ipcMain.handle('vigil:config', () => this.request('GET', '/config/full'))

		ipcMain.handle('vigil:updateConfig', async (_e, body: unknown) => {
			const result = await this.request('PUT', '/config', body)
			if (result.error === undefined) void this.refreshConfig()
			return result
		})

		ipcMain.handle('vigil:pauseToggle', async () => {
			const paused = this.snapshot.status?.queue.paused ?? false
			const result = await this.request('POST', paused ? '/queue/resume' : '/queue/pause')
			this.kick()
			return result
		})

		ipcMain.handle('vigil:poll', async () => {
			const result = await this.request('POST', '/poll/trigger')
			this.kick()
			return result
		})
	}
}
