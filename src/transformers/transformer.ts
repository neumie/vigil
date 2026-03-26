import type { TaskContext } from '../providers/provider.js'
import { defaultTransformer } from './default.js'

export type TaskTransformer = (task: TaskContext) => string

const transformers: Record<string, TaskTransformer> = {
	default: defaultTransformer,
}

export function getTransformer(name: string): TaskTransformer {
	const transformer = transformers[name]
	if (!transformer) {
		throw new Error(`Unknown transformer: "${name}". Available: ${Object.keys(transformers).join(', ')}`)
	}
	return transformer
}
