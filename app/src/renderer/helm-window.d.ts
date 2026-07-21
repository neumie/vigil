import type { HelmApi } from '../shared'

declare global {
	interface Window {
		helm: HelmApi
	}
}
