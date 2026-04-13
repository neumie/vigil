import { existsSync, readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

interface CliConfig {
	token: string
	token_id: string
}

interface RemoteConfig {
	port: number
	pid: number
}

interface OkenaCredentials {
	token: string
	baseUrl: string
}

const EXPIRED_TOKEN_HINT =
	'Okena CLI token expired or invalid. Re-register by running the okena binary (e.g. `okena state`), then restart vigil.'

export class OkenaClient {
	private configDir: string

	constructor() {
		this.configDir =
			process.platform === 'darwin'
				? join(homedir(), 'Library', 'Application Support', 'okena')
				: join(homedir(), '.config', 'okena')
	}

	private loadCredentials(): OkenaCredentials | null {
		const cliPath = join(this.configDir, 'cli.json')
		if (!existsSync(cliPath)) return null

		let token: string
		try {
			const cli: CliConfig = JSON.parse(readFileSync(cliPath, 'utf-8'))
			token = cli.token
		} catch {
			return null
		}

		const remotePath = join(this.configDir, 'remote.json')
		if (!existsSync(remotePath)) return null

		try {
			const remote: RemoteConfig = JSON.parse(readFileSync(remotePath, 'utf-8'))
			if (remote.pid && !this.isProcessAlive(remote.pid)) return null
			return { token, baseUrl: `http://127.0.0.1:${remote.port}` }
		} catch {
			return null
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
		const creds = this.loadCredentials()
		if (!creds) return false
		try {
			const res = await fetch(`${creds.baseUrl}/health`, { signal: AbortSignal.timeout(2000) })
			return res.ok
		} catch {
			return false
		}
	}

	private async authorizedFetch(path: string, init: RequestInit = {}): Promise<Response> {
		const creds = this.loadCredentials()
		if (!creds) throw new Error('Okena not configured')

		const send = (c: OkenaCredentials) =>
			fetch(`${c.baseUrl}${path}`, {
				...init,
				headers: {
					...(init.headers as Record<string, string> | undefined),
					Authorization: `Bearer ${c.token}`,
				},
			})

		const res = await send(creds)
		if (res.status !== 401) return res

		// Token may have been refreshed externally between read and send — re-read and retry once.
		const fresh = this.loadCredentials()
		if (!fresh || fresh.token === creds.token) return res
		return send(fresh)
	}

	async action<T = unknown>(payload: Record<string, unknown>): Promise<T> {
		const res = await this.authorizedFetch('/v1/actions', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify(payload),
		})

		if (!res.ok) {
			if (res.status === 401) throw new Error(`Okena action failed (401): ${EXPIRED_TOKEN_HINT}`)
			const body = await res.text()
			throw new Error(`Okena action failed (${res.status}): ${body}`)
		}

		return res.json() as Promise<T>
	}

	async getState(): Promise<OkenaState> {
		const res = await this.authorizedFetch('/v1/state')
		if (!res.ok) {
			if (res.status === 401) throw new Error(`Okena state failed (401): ${EXPIRED_TOKEN_HINT}`)
			throw new Error(`Okena state failed (${res.status})`)
		}
		return res.json() as Promise<OkenaState>
	}
}

export interface OkenaState {
	projects: Array<{
		id: string
		name: string
		path: string
		terminal_names?: Record<string, string>
	}>
}
