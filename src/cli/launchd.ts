import { execSync } from 'node:child_process'
import { existsSync, mkdirSync, unlinkSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const LABEL = 'com.vigil.daemon'
const PLIST_DIR = join(homedir(), 'Library', 'LaunchAgents')
const PLIST_PATH = join(PLIST_DIR, `${LABEL}.plist`)
const LOG_DIR = join(homedir(), 'Library', 'Logs', 'vigil')
export const STDOUT_LOG = join(LOG_DIR, 'stdout.log')
export const STDERR_LOG = join(LOG_DIR, 'stderr.log')

function vigilRoot(): string {
	const thisFile = fileURLToPath(import.meta.url)
	// dist/cli/launchd.js -> project root (two levels up from dist/cli/)
	return resolve(dirname(thisFile), '..', '..')
}

function entryPoint(): string {
	return join(vigilRoot(), 'dist', 'index.js')
}

function buildPlist(env: Record<string, string>): string {
	const root = vigilRoot()
	const entry = entryPoint()
	const envEntries = Object.entries(env)
		.map(([k, v]) => `\t\t\t<key>${k}</key>\n\t\t\t<string>${v}</string>`)
		.join('\n')
	const envBlock = envEntries.length > 0 ? `\t<key>EnvironmentVariables</key>\n\t<dict>\n${envEntries}\n\t</dict>` : ''

	return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
\t<key>Label</key>
\t<string>${LABEL}</string>
\t<key>ProgramArguments</key>
\t<array>
\t\t<string>${process.execPath}</string>
\t\t<string>${entry}</string>
\t</array>
\t<key>WorkingDirectory</key>
\t<string>${root}</string>
\t<key>KeepAlive</key>
\t<true/>
\t<key>StandardOutPath</key>
\t<string>${STDOUT_LOG}</string>
\t<key>StandardErrorPath</key>
\t<string>${STDERR_LOG}</string>
${envBlock}
</dict>
</plist>`
}

export function isLoaded(): boolean {
	try {
		const output = execSync(`launchctl list ${LABEL} 2>/dev/null`, { encoding: 'utf-8' })
		return output.includes(LABEL)
	} catch {
		return false
	}
}

export function getPid(): number | null {
	try {
		const output = execSync(`launchctl list ${LABEL} 2>/dev/null`, { encoding: 'utf-8' })
		const match = output.match(/"PID"\s*=\s*(\d+)/)
		if (match) return Number(match[1])
		const lines = output.trim().split('\n')
		for (const line of lines) {
			const parts = line.trim().split('\t')
			if (parts[0] && /^\d+$/.test(parts[0])) return Number(parts[0])
		}
		return null
	} catch {
		return null
	}
}

export function load(): void {
	if (isLoaded()) {
		throw new Error('Vigil is already running. Use `vigil stop` first.')
	}

	if (!existsSync(entryPoint())) {
		throw new Error(`Compiled entry point not found at ${entryPoint()}. Run \`npm run build\` first.`)
	}

	mkdirSync(LOG_DIR, { recursive: true })
	mkdirSync(PLIST_DIR, { recursive: true })

	const env: Record<string, string> = {}
	if (process.env.VIGIL_CONFIG) {
		env.VIGIL_CONFIG = process.env.VIGIL_CONFIG
	}

	writeFileSync(PLIST_PATH, buildPlist(env), 'utf-8')
	execSync(`launchctl load ${PLIST_PATH}`)
}

export function unload(): void {
	if (!isLoaded()) {
		throw new Error('Vigil is not running.')
	}

	execSync(`launchctl unload ${PLIST_PATH}`)

	if (existsSync(PLIST_PATH)) {
		unlinkSync(PLIST_PATH)
	}
}
