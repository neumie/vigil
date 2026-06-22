import { DEFAULT_SERVER_URL, getSync, setSync } from './storage'

const urlInput = document.getElementById('url') as HTMLInputElement
const statusEl = document.getElementById('status') as HTMLElement

// Load saved URL
getSync({ serverUrl: DEFAULT_SERVER_URL })
	.then(items => {
		urlInput.value = items.serverUrl
	})
	.catch(() => {
		urlInput.value = DEFAULT_SERVER_URL
	})

// Save on change (debounced)
let saveTimeout: ReturnType<typeof setTimeout>
urlInput.addEventListener('input', () => {
	clearTimeout(saveTimeout)
	saveTimeout = setTimeout(() => {
		const url = urlInput.value.trim().replace(/\/$/, '')
		void setSync({ serverUrl: url }).then(() => {
			// Test connection
			fetch(`${url}/api/status`)
				.then(r => {
					if (r.ok) {
						statusEl.textContent = 'Connected'
						statusEl.style.color = '#6a9955'
					} else {
						statusEl.textContent = `Error: ${r.status}`
						statusEl.style.color = '#f14c4c'
					}
				})
				.catch(() => {
					statusEl.textContent = 'Cannot connect'
					statusEl.style.color = '#f14c4c'
				})
		})
	}, 500)
})
