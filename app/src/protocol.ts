// vigil:// deep links. The only supported form is `vigil://item/<id>` — the
// Chrome extension's "Open" link (extension/src/Widget.tsx) points here since
// the browser dashboard (web/) was retired; helm is the OS handler
// (app.setAsDefaultProtocolClient in src/main.ts) and navigates the sidebar to
// the item. Electron-free module so the parser is testable under plain node.

/** Extract the item id from a `vigil://item/<id>` URL, or null when it isn't one. */
export function parseVigilItemUrl(raw: string): string | null {
	let url: URL
	try {
		url = new URL(raw)
	} catch {
		return null
	}
	if (url.protocol !== 'vigil:' || url.hostname !== 'item') return null
	const id = decodeURIComponent(url.pathname.replace(/^\//, ''))
	// Exactly one path segment; anything deeper is not an item link.
	if (id === '' || id.includes('/')) return null
	return id
}
