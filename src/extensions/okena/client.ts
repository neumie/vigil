import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { homedir } from 'node:os'
import { log } from '../../util/logger.js'

interface CliConfig {
	token: string
	token_id: string
}

interface RemoteConfig {
	port: number
	pid: number
}

export class OkenaClient {
	private token: string | null = null
	private baseUrl: string | null = null

	constructor() {
		const configDir =
			process.platform === 'darwin'
				? join(homedir(), 'Library', 'Application Support', 'okena')
				: join(homedir(), '.config', 'okena')
		this.discover(configDir)
	}

	private discover(configDir: string) {
		// Read CLI token
		const cliPath = join(configDir, 'cli.json')
		if (!existsSync(cliPath)) return

		try {
			const cli: CliConfig = JSON.parse(readFileSync(cliPath, 'utf-8'))
			this.token = cli.token
		} catch {
			return
		}

		// Read remote server info
		const remotePath = join(configDir, 'remote.json')
		if (!existsSync(remotePath)) return

		try {
			const remote: RemoteConfig = JSON.parse(readFileSync(remotePath, 'utf-8'))
			if (remote.pid && !this.isProcessAlive(remote.pid)) {
				log.warn('okena', 'Okena not running (stale remote.json)')
				return
			}
			this.baseUrl = `http://127.0.0.1:${remote.port}`
		} catch {
			return
		}
	}

	private isProcessAlive(pid: number): boolean {
		try {
			process.kill(pid, 0)
			return true
		} catch {
			return false
		}
	}

	async isAvailable(): Promise<boolean> {
		if (!this.baseUrl || !this.token) return false
		try {
			const res = await fetch(`${this.baseUrl}/health`, { signal: AbortSignal.timeout(2000) })
			return res.ok
		} catch {
			return false
		}
	}

	async action<T = unknown>(payload: Record<string, unknown>): Promise<T> {
		if (!this.baseUrl || !this.token) {
			throw new Error('Okena not configured')
		}

		const res = await fetch(`${this.baseUrl}/v1/actions`, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				Authorization: `Bearer ${this.token}`,
			},
			body: JSON.stringify(payload),
		})

		if (!res.ok) {
			const body = await res.text()
			throw new Error(`Okena action failed (${res.status}): ${body}`)
		}

		return res.json() as Promise<T>
	}

	async getState(): Promise<OkenaState> {
		if (!this.baseUrl || !this.token) {
			throw new Error('Okena not configured')
		}

		const res = await fetch(`${this.baseUrl}/v1/state`, {
			headers: { Authorization: `Bearer ${this.token}` },
		})

		if (!res.ok) throw new Error(`Okena state failed (${res.status})`)
		return res.json() as Promise<OkenaState>
	}
}

export interface OkenaState {
	projects: Array<{
		id: string
		name: string
		path: string
	}>
}
