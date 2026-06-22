import { z } from 'zod'

export const spawnerNameSchema = z
	.string()
	.min(1)
	.regex(/^[a-z][a-z0-9-]*$/)

export type SpawnerName = z.infer<typeof spawnerNameSchema>
