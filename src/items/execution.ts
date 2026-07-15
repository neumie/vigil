import type { ItemRecord } from './schema.js'

export type ItemExecutionMode = 'solve' | 'loop'
export type LoopPayload = Extract<ItemRecord['payload'], { kind: 'loop' }>

/** Runtime lane selection is independent from durable Item/source identity. */
export function itemExecutionMode(item: ItemRecord): ItemExecutionMode {
	if (item.kind === 'loop') return 'loop'
	return item.payload.kind === 'solve' && item.payload.execution?.mode === 'loop' ? 'loop' : 'solve'
}

/** Adapt a standalone Loop Item or planned solve-through-loop into LoopRunner input. */
export function loopPayloadForItem(item: ItemRecord): LoopPayload | null {
	if (item.payload.kind === 'loop') return item.payload
	if (item.payload.kind !== 'solve' || item.payload.execution?.mode !== 'loop') return null
	return {
		kind: 'loop',
		prdPath: item.payload.execution.prdPath,
		...item.payload.execution.options,
	}
}
