import { app, BrowserWindow, Menu, ipcMain, shell } from 'electron'
import * as os from 'node:os'
import * as path from 'node:path'
import * as pty from 'node-pty'

const daemonUrl = process.env.VIGIL_URL ?? 'http://localhost:7474'

const ptys = new Map<number, pty.IPty>()
let nextPtyId = 1
let mainWindow: BrowserWindow | null = null

function defaultShell(): string {
	if (process.platform === 'win32') return process.env.COMSPEC ?? 'powershell.exe'
	return process.env.SHELL ?? '/bin/zsh'
}

function killAllPtys(): void {
	for (const p of ptys.values()) {
		try {
			p.kill()
		} catch {
			// already exited
		}
	}
	ptys.clear()
}

function createWindow(): void {
	const win = new BrowserWindow({
		width: 1400,
		height: 900,
		title: 'Helm',
		backgroundColor: '#141517',
		webPreferences: {
			preload: path.join(__dirname, 'preload.cjs'),
			contextIsolation: true,
			nodeIntegration: false,
		},
	})
	// Terminal web-links + dashboard target=_blank links open in the default browser, never a new Electron window.
	win.webContents.setWindowOpenHandler(({ url }) => {
		if (/^https?:/.test(url)) void shell.openExternal(url)
		return { action: 'deny' }
	})
	win.on('closed', () => {
		if (mainWindow === win) mainWindow = null
		killAllPtys()
	})
	void win.loadFile(path.join(__dirname, 'index.html'))
	mainWindow = win
}

function buildMenu(): void {
	const send = (channel: string) => () => mainWindow?.webContents.send(channel)
	const template: Electron.MenuItemConstructorOptions[] = [
		...(process.platform === 'darwin' ? [{ role: 'appMenu' as const }] : []),
		{
			label: 'Shell',
			submenu: [
				{ label: 'New Terminal', accelerator: 'CmdOrCtrl+T', click: send('tab:new') },
				// Owning cmd+w here keeps it from closing the window (no window-menu close role).
				{ label: 'Close Terminal', accelerator: 'CmdOrCtrl+W', click: send('tab:close') },
			],
		},
		{ role: 'editMenu' },
		{ role: 'viewMenu' },
		{ label: 'Window', submenu: [{ role: 'minimize' }, { role: 'zoom' }] },
	]
	Menu.setApplicationMenu(Menu.buildFromTemplate(template))
}

interface SpawnArgs {
	cols: number
	rows: number
}

// Helm is usually launched via `bun run start` / `npm start`, and those
// launchers inject npm_config_*/npm_lifecycle_*/BUN_* vars into our process.
// Passing them into the interactive shell breaks tooling in the user's rc
// files (nvm hard-errors on npm_config_prefix). Spawn shells with a scrubbed
// environment instead.
function shellEnv(): Record<string, string> {
	const env: Record<string, string> = {}
	for (const [key, value] of Object.entries(process.env)) {
		if (value === undefined) continue
		if (key.startsWith('npm_') || key.startsWith('BUN_') || key === 'NODE_ENV' || key === 'INIT_CWD') continue
		env[key] = value
	}
	return env
}

ipcMain.handle('pty:spawn', (event, args: SpawnArgs) => {
	const id = nextPtyId++
	const proc = pty.spawn(defaultShell(), process.platform === 'win32' ? [] : ['-l'], {
		name: 'xterm-256color',
		cols: Math.max(2, Math.floor(args.cols) || 80),
		rows: Math.max(2, Math.floor(args.rows) || 24),
		cwd: os.homedir(),
		env: shellEnv(),
	})
	ptys.set(id, proc)
	const contents = event.sender
	proc.onData((data) => {
		if (!contents.isDestroyed()) contents.send('pty:data', id, data)
	})
	proc.onExit(({ exitCode }) => {
		ptys.delete(id)
		if (!contents.isDestroyed()) contents.send('pty:exit', id, exitCode)
	})
	return id
})

ipcMain.on('pty:write', (_event, id: number, data: string) => {
	ptys.get(id)?.write(data)
})

ipcMain.on('pty:resize', (_event, id: number, cols: number, rows: number) => {
	const proc = ptys.get(id)
	if (!proc || !(cols > 0) || !(rows > 0)) return
	try {
		proc.resize(Math.floor(cols), Math.floor(rows))
	} catch {
		// pty already exited
	}
})

ipcMain.on('pty:kill', (_event, id: number) => {
	const proc = ptys.get(id)
	if (!proc) return
	ptys.delete(id)
	try {
		proc.kill()
	} catch {
		// already exited
	}
})

ipcMain.on('config:get', (event) => {
	event.returnValue = { daemonUrl }
})

ipcMain.handle('daemon:ping', async () => {
	try {
		const res = await fetch(daemonUrl, { signal: AbortSignal.timeout(2000) })
		return res.ok
	} catch {
		return false
	}
})

void app.whenReady().then(() => {
	buildMenu()
	createWindow()
	app.on('activate', () => {
		if (BrowserWindow.getAllWindows().length === 0) createWindow()
	})
})

app.on('window-all-closed', () => {
	killAllPtys()
	app.quit()
})

app.on('before-quit', killAllPtys)
