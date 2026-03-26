import { ContemberProvider, type ContemberProviderConfig } from './contember.js'
import type { TaskProvider } from './provider.js'

export type ProviderConfig = ContemberProviderConfig
// Future: | GitHubProviderConfig | LinearProviderConfig

export function createProvider(config: ProviderConfig): TaskProvider {
	switch (config.type) {
		case 'contember':
			return new ContemberProvider(config)
		default:
			throw new Error(`Unknown provider type: ${(config as { type: string }).type}`)
	}
}
