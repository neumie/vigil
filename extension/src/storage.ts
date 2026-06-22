export const DEFAULT_SERVER_URL = 'http://localhost:7474'

type ChromeStorageApi = {
	runtime?: {
		lastError?: {
			message?: string
		}
	}
	storage?: {
		sync?: {
			get<T extends Record<string, unknown>>(defaults: T, callback: (items: T) => void): void
			set(items: Record<string, unknown>, callback?: () => void): void
		}
	}
}

function chromeApi(): ChromeStorageApi | null {
	return ((globalThis as typeof globalThis & { chrome?: ChromeStorageApi }).chrome ?? null) as ChromeStorageApi | null
}

export function isExtensionContextInvalidated(err: unknown): boolean {
	return err instanceof Error && err.message.includes('Extension context invalidated')
}

export async function getSync<T extends Record<string, unknown>>(defaults: T): Promise<T> {
	const chrome = chromeApi()
	if (!chrome?.storage?.sync) return defaults

	return new Promise((resolve, reject) => {
		try {
			chrome.storage?.sync?.get(defaults, items => {
				const lastError = chrome.runtime?.lastError?.message
				if (lastError) {
					if (lastError.includes('Extension context invalidated')) resolve(defaults)
					else reject(new Error(lastError))
					return
				}
				resolve(items)
			})
		} catch (err) {
			if (isExtensionContextInvalidated(err)) {
				resolve(defaults)
				return
			}
			reject(err)
		}
	})
}

export async function setSync(items: Record<string, unknown>): Promise<boolean> {
	const chrome = chromeApi()
	if (!chrome?.storage?.sync) return false

	return new Promise((resolve, reject) => {
		try {
			chrome.storage?.sync?.set(items, () => {
				const lastError = chrome.runtime?.lastError?.message
				if (lastError) {
					if (lastError.includes('Extension context invalidated')) resolve(false)
					else reject(new Error(lastError))
					return
				}
				resolve(true)
			})
		} catch (err) {
			if (isExtensionContextInvalidated(err)) {
				resolve(false)
				return
			}
			reject(err)
		}
	})
}
