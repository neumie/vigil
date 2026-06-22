import type { TaskContext } from '../providers/provider.js'
import type { ItemRecord } from './schema.js'

function itemMetadata(item: ItemRecord): Record<string, string> {
	const metadata: Record<string, string> = {
		'Item ID': item.id,
		Kind: item.kind,
		BaseRef: item.baseRef,
	}
	if (item.source) {
		metadata.Source = item.source.externalId
	}
	return metadata
}

export function buildItemTaskContext(item: ItemRecord, sourceContext?: TaskContext | null): TaskContext {
	const metadata = itemMetadata(item)

	switch (item.payload.kind) {
		case 'solve':
			if (item.source && sourceContext) {
				return {
					...sourceContext,
					title: sourceContext.title || item.title,
					metadata: { ...(sourceContext.metadata ?? {}), ...metadata },
				}
			}
			return {
				title: item.title,
				description: item.payload.prompt,
				metadata,
			}
		case 'ralph':
			return {
				title: item.title,
				description: `Run almanac ralph for PRD: ${item.payload.prdPath}`,
				metadata: { ...metadata, PRD: item.payload.prdPath },
			}
		case 'harden':
			return {
				title: item.title,
				description: `Run almanac harden for target: ${item.payload.target}`,
				metadata: { ...metadata, Target: item.payload.target },
			}
	}
}
