import { contextBridge, ipcRenderer } from 'electron'
import type { IpcRendererEvent } from 'electron'
import type { RunContextEditorApi } from './shared'
import type { HelmResult, RunContextDraft, RunContextLoad, RunContextReset, RunContextSave } from './shared-helm'

const api: RunContextEditorApi = {
	load: () => ipcRenderer.invoke('run-context:load') as Promise<HelmResult<RunContextLoad>>,
	save: (revision: number, document: RunContextDraft) =>
		ipcRenderer.invoke('run-context:save', revision, document) as Promise<HelmResult<RunContextSave>>,
	reset: (revision: number) =>
		ipcRenderer.invoke('run-context:reset', revision) as Promise<HelmResult<RunContextReset>>,
	setDirty: (dirty: boolean) => ipcRenderer.send('run-context:dirty', dirty),
	close: (discard: boolean) => ipcRenderer.send('run-context:close', discard),
	cancelClose: () => ipcRenderer.send('run-context:cancel-close'),
	onCloseRequested: listener => {
		const handler = (_event: IpcRendererEvent) => listener()
		ipcRenderer.on('run-context:close-requested', handler)
		return () => ipcRenderer.removeListener('run-context:close-requested', handler)
	},
}

contextBridge.exposeInMainWorld('runContextEditor', api)
