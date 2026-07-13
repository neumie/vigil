import { contextBridge, ipcRenderer } from 'electron'
import type { IpcRendererEvent } from 'electron'
import type { GraceClose, HelmApi, PtySpawnResult, RestoredSession, ThemeListEntry, UiPreview } from './shared'
import type { VigilApi, VigilResult, VigilSnapshot } from './shared-vigil'

// Captured synchronously at preload time so the renderer gets the URL without an async hop.
const { daemonUrl } = ipcRenderer.sendSync('config:get') as { daemonUrl: string }

// --ui-preview=<list|detail|settings> arrives via webPreferences.additionalArguments
// (main.ts) for screenshot runs; the sidebar auto-navigates to the named page.
const uiPreviewArg = process.argv.find(arg => arg.startsWith('--ui-preview='))?.slice('--ui-preview='.length)
const uiPreview: UiPreview | null =
	uiPreviewArg === 'list' || uiPreviewArg === 'detail' || uiPreviewArg === 'settings' || uiPreviewArg === 'appearance'
		? uiPreviewArg
		: null

// --ui-theme=<presetId>: screenshot runs verify a theme preset visually.
const uiTheme = process.argv.find(arg => arg.startsWith('--ui-theme='))?.slice('--ui-theme='.length) ?? null

function subscribe<Args extends unknown[]>(channel: string, listener: (...args: Args) => void): () => void {
	const handler = (_event: IpcRendererEvent, ...args: unknown[]) => listener(...(args as Args))
	ipcRenderer.on(channel, handler)
	return () => ipcRenderer.removeListener(channel, handler)
}

// All vigil command channels resolve with the daemon's { data } | { error }
// envelope (the bridge never rejects), so the cast is one shared seam.
function invokeVigil<T>(channel: string, ...args: unknown[]): Promise<VigilResult<T>> {
	return ipcRenderer.invoke(channel, ...args) as Promise<VigilResult<T>>
}

const api: HelmApi = {
	pty: {
		spawn: (cols, rows, sessionId) =>
			ipcRenderer.invoke('pty:spawn', { cols, rows, sessionId }) as Promise<PtySpawnResult>,
		write: (id, data) => ipcRenderer.send('pty:write', id, data),
		resize: (id, cols, rows) => ipcRenderer.send('pty:resize', id, cols, rows),
		kill: id => ipcRenderer.send('pty:kill', id),
		onData: listener => subscribe('pty:data', listener),
		onExit: listener => subscribe('pty:exit', listener),
	},
	sessions: {
		list: () => ipcRenderer.invoke('sessions:list') as Promise<RestoredSession[]>,
		setTitle: (sessionId, title) => ipcRenderer.send('session:title', sessionId, title),
		closeWithGrace: ptyId => ipcRenderer.invoke('session:close-with-grace', ptyId) as Promise<GraceClose | null>,
		undoClose: sessionId => ipcRenderer.invoke('session:undo-close', sessionId) as Promise<boolean>,
	},
	config: {
		getDaemonUrl: () => daemonUrl,
	},
	appearance: {
		listThemes: () => ipcRenderer.invoke('themes:list') as Promise<ThemeListEntry[]>,
		onFontStep: listener => subscribe('font:step', listener),
	},
	vigil: {
		subscribe: () => ipcRenderer.invoke('vigil:subscribe') as Promise<VigilSnapshot>,
		onSnapshot: listener => subscribe('vigil:snapshot', listener),
		item: id => invokeVigil('vigil:item', id),
		itemAction: (id, action, body) => invokeVigil('vigil:itemAction', id, action, body),
		plan: (id, body) => invokeVigil('vigil:plan', id, body),
		aiPass: (id, pass) => invokeVigil('vigil:aiPass', id, pass),
		createItem: body => invokeVigil('vigil:createItem', body),
		sourceTask: id => invokeVigil('vigil:sourceTask', id),
		setStatus: (id, status) => invokeVigil('vigil:setStatus', id, status),
		config: () => invokeVigil('vigil:config'),
		updateConfig: body => invokeVigil('vigil:updateConfig', body),
		pauseToggle: () => invokeVigil('vigil:pauseToggle'),
		poll: () => invokeVigil('vigil:poll'),
	} satisfies VigilApi,
	tabs: {
		onNew: listener => subscribe('tab:new', listener),
		onClose: listener => subscribe('tab:close', listener),
	},
	nav: {
		onOpenItem: listener => subscribe('nav:open-item', listener),
		onGo: listener =>
			subscribe<[string]>('nav:go', direction => {
				if (direction === 'back' || direction === 'forward') listener(direction)
			}),
	},
	platform: process.platform,
	uiPreview,
	uiTheme,
}

contextBridge.exposeInMainWorld('helm', api)
