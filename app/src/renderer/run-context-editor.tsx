import { useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import './styles.css'
import './sidebar/sidebar.css'
import './run-context/run-context-editor.css'
import type { RunContextLoad } from '../shared-helm'
import { appearance } from './appearance'
import { RunContextEditor } from './run-context/RunContextEditor'
import { Btn } from './sidebar/ui'

appearance.init()

function App() {
	const [loaded, setLoaded] = useState<RunContextLoad | null>(null)
	const [error, setError] = useState<string | null>(null)

	const load = () => {
		setLoaded(null)
		setError(null)
		void window.runContextEditor.load().then(result => {
			if (result.error !== undefined) setError(result.error)
			else setLoaded(result.data)
		})
	}

	useEffect(load, [])

	if (error) {
		return (
			<main className="run-context-start-state" role="alert">
				<h1>Run context unavailable</h1>
				<p>{error}</p>
				<Btn tone="primary" onClick={load}>
					Try again
				</Btn>
			</main>
		)
	}
	if (!loaded) {
		return (
			<main className="run-context-start-state" aria-busy="true">
				<h1>Loading run context</h1>
			</main>
		)
	}
	return (
		<RunContextEditor
			key={`${loaded.revision}:${loaded.document?.updatedAt ?? 'source'}`}
			loaded={loaded}
			onReload={setLoaded}
		/>
	)
}

const root = document.getElementById('run-context-root')
if (!root) throw new Error('missing #run-context-root')
createRoot(root).render(<App />)
