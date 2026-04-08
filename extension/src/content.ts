import { VigilWidget } from './widget'

function extractTaskId(): string | null {
	const params = new URLSearchParams(window.location.search)
	const path = window.location.pathname

	// project-detail page: task is in ?task= param (?id= is the project, not the task)
	if (path.includes('project-detail')) {
		return params.get('task') ?? null
	}

	// task-detail page: task is in ?id= param
	if (path.includes('task-detail')) {
		return params.get('id') ?? null
	}

	// Fallback: try ?task first, then ?id
	return params.get('task') ?? null
}

const widget = new VigilWidget()
let lastUrl = ''

function update() {
	const url = window.location.href
	if (url === lastUrl) return
	lastUrl = url
	widget.setTaskId(extractTaskId())
}

// Initial check
update()

// SPA navigation detection
window.addEventListener('popstate', update)
window.addEventListener('hashchange', update)

// Catch SPA pushState/replaceState that don't fire popstate
const origPushState = history.pushState.bind(history)
const origReplaceState = history.replaceState.bind(history)

history.pushState = (...args: Parameters<typeof history.pushState>) => {
	origPushState(...args)
	lastUrl = ''
	update()
}

history.replaceState = (...args: Parameters<typeof history.replaceState>) => {
	origReplaceState(...args)
	lastUrl = ''
	update()
}

// Fallback: poll URL for changes frameworks may not trigger via pushState
setInterval(update, 1000)
