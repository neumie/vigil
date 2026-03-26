# Vigil CLI + launchd Daemon Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a global `vigil` CLI command (`vigil start`, `vigil stop`, `vigil status`, `vigil logs`) that manages Vigil as a macOS launchd daemon with auto-restart on crash.

**Architecture:** A thin CLI entry point (`src/cli/vigil.ts`) parses subcommands and delegates to a launchd helper module (`src/cli/launchd.ts`) that generates/loads/unloads a plist and reads log files. The existing `src/index.ts` daemon entry point is unchanged — launchd simply runs `node dist/index.js`.

**Tech Stack:** Node.js built-in `child_process.execSync`, `fs`, `path`, `os`. No new dependencies.

---

## File Structure

| Action | Path | Responsibility |
|--------|------|----------------|
| Create | `src/cli/vigil.ts` | CLI entry point — parses subcommands, dispatches to handlers |
| Create | `src/cli/launchd.ts` | Plist generation, `launchctl load/unload`, log path helpers |
| Modify | `package.json` | Add `bin` field pointing to `dist/cli/vigil.js` |

---

### Task 1: Create the launchd helper module

**Files:**
- Create: `src/cli/launchd.ts`

This module handles all launchd interaction: plist XML generation, loading/unloading the agent, querying status, and resolving log paths.

- [ ] **Step 1: Create `src/cli/launchd.ts` with constants and path helpers**

```typescript
import { existsSync, mkdirSync, writeFileSync, unlinkSync } from 'node:fs'
import { execSync } from 'node:child_process'
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
```

- [ ] **Step 2: Add plist generation function**

```typescript
function buildPlist(env: Record<string, string>): string {
	const root = vigilRoot()
	const entry = entryPoint()
	const envEntries = Object.entries(env)
		.map(([k, v]) => `\t\t\t<key>${k}</key>\n\t\t\t<string>${v}</string>`)
		.join('\n')
	const envBlock =
		envEntries.length > 0
			? `\t<key>EnvironmentVariables</key>\n\t<dict>\n${envEntries}\n\t</dict>`
			: ''

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
```

- [ ] **Step 3: Add load/unload/status/isLoaded functions**

```typescript
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
		// launchctl list <label> outputs a table: first column is PID (or "-" if not running)
		const match = output.match(/"PID"\s*=\s*(\d+)/)
		if (match) return Number(match[1])
		// Fallback: first line format "PID\tStatus\tLabel" in some macOS versions
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
		throw new Error(
			`Compiled entry point not found at ${entryPoint()}. Run \`npm run build\` first.`,
		)
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
```

- [ ] **Step 4: Verify the file compiles**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 5: Commit**

```bash
git add src/cli/launchd.ts
git commit -m "feat(cli): add launchd helper module for plist management"
```

---

### Task 2: Create the CLI entry point

**Files:**
- Create: `src/cli/vigil.ts`

The CLI parses the first argument as a subcommand and dispatches to the appropriate handler. It uses no external arg-parsing library — just `process.argv`.

- [ ] **Step 1: Create `src/cli/vigil.ts` with subcommand routing**

```typescript
#!/usr/bin/env node

import { execSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { isLoaded, load, unload, getPid, STDOUT_LOG, STDERR_LOG } from './launchd.js'

const HELP = `Usage: vigil <command>

Commands:
  start    Start the Vigil daemon
  stop     Stop the Vigil daemon
  status   Show daemon status
  logs     Tail daemon logs (--err for stderr)
  help     Show this help message`

function start(): void {
	try {
		load()
		console.log('Vigil daemon started.')
		console.log(`Logs: ${STDOUT_LOG}`)
	} catch (err) {
		console.error(`Error: ${err instanceof Error ? err.message : err}`)
		process.exit(1)
	}
}

function stop(): void {
	try {
		unload()
		console.log('Vigil daemon stopped.')
	} catch (err) {
		console.error(`Error: ${err instanceof Error ? err.message : err}`)
		process.exit(1)
	}
}

function status(): void {
	if (!isLoaded()) {
		console.log('Vigil is not running.')
		process.exit(1)
	}
	const pid = getPid()
	console.log(`Vigil is running.${pid ? ` (PID: ${pid})` : ''}`)
}

function logs(): void {
	const useStderr = process.argv.includes('--err')
	const logFile = useStderr ? STDERR_LOG : STDOUT_LOG

	if (!existsSync(logFile)) {
		console.error(`Log file not found: ${logFile}`)
		console.error('Has Vigil been started at least once?')
		process.exit(1)
	}

	try {
		execSync(`tail -f "${logFile}"`, { stdio: 'inherit' })
	} catch {
		// User hit Ctrl+C to exit tail — expected
	}
}

const command = process.argv[2]

switch (command) {
	case 'start':
		start()
		break
	case 'stop':
		stop()
		break
	case 'status':
		status()
		break
	case 'logs':
		logs()
		break
	case 'help':
	case '--help':
	case '-h':
	case undefined:
		console.log(HELP)
		break
	default:
		console.error(`Unknown command: ${command}`)
		console.log(HELP)
		process.exit(1)
}
```

- [ ] **Step 2: Verify the file compiles**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add src/cli/vigil.ts
git commit -m "feat(cli): add vigil CLI entry point with start/stop/status/logs"
```

---

### Task 3: Wire up package.json bin field and shebang

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Add `bin` field to package.json**

Add the following field to `package.json` (after `"type": "module"`):

```json
"bin": {
  "vigil": "./dist/cli/vigil.js"
},
```

- [ ] **Step 2: Build the project**

Run: `npm run build`
Expected: Compiles successfully, `dist/cli/vigil.js` and `dist/cli/launchd.js` exist

- [ ] **Step 3: Verify the shebang is present in compiled output**

Run: `head -1 dist/cli/vigil.js`
Expected: `#!/usr/bin/env node`

TypeScript preserves shebangs from source files during compilation. If the shebang is missing from the compiled output, add a `postbuild` script or manually prepend it.

- [ ] **Step 4: Run `npm link` to install globally**

Run: `npm link`
Expected: Creates a global `vigil` symlink. Verify with `which vigil`.

- [ ] **Step 5: Verify the CLI responds**

Run: `vigil help`
Expected output:
```
Usage: vigil <command>

Commands:
  start    Start the Vigil daemon
  stop     Stop the Vigil daemon
  status   Show daemon status
  logs     Tail daemon logs (--err for stderr)
  help     Show this help message
```

- [ ] **Step 6: Commit**

```bash
git add package.json
git commit -m "feat(cli): add bin field for global vigil command"
```

---

### Task 4: Build and lint verification

**Files:** None (verification only)

- [ ] **Step 1: Full build**

Run: `npm run build`
Expected: Clean compilation, no errors

- [ ] **Step 2: Lint check**

Run: `npm run lint`
Expected: No lint errors (fix any that appear with `npm run lint:fix`)

- [ ] **Step 3: End-to-end smoke test**

Run these commands in sequence:

```bash
# 1. Start the daemon
vigil start

# 2. Check status
vigil status
# Expected: "Vigil is running. (PID: <number>)"

# 3. Check that the process is actually running
launchctl list com.vigil.daemon

# 4. Check logs exist
ls ~/Library/Logs/vigil/
# Expected: stdout.log and stderr.log exist

# 5. Stop the daemon
vigil stop
# Expected: "Vigil daemon stopped."

# 6. Verify it's stopped
vigil status
# Expected: "Vigil is not running." (exit code 1)
```

Note: The daemon may fail to fully start if `vigil.config.json` is missing or misconfigured — that's expected. The test here is that launchd loads/unloads the agent correctly and the CLI commands work. Check `~/Library/Logs/vigil/stderr.log` if the daemon exits immediately.

- [ ] **Step 4: Commit any lint fixes if needed**

```bash
git add -A
git commit -m "chore: lint fixes for CLI"
```
