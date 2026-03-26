import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { z } from 'zod'

const projectSchema = z.object({
	slug: z.string(),
	repoPath: z.string(),
	baseBranch: z.string().default('main'),
	worktreeDir: z.string().optional(),
})

const configSchema = z.object({
	contember: z.object({
		apiBaseUrl: z.string().url(),
		projectSlug: z.string(),
		apiToken: z.string().min(1),
	}),
	projects: z.array(projectSchema).min(1),
	polling: z
		.object({
			intervalSeconds: z.number().min(5).default(60),
		})
		.default({}),
	solver: z
		.object({
			concurrency: z.number().min(1).max(10).default(2),
			model: z.string().optional(),
			maxBudgetUsd: z.number().optional(),
			timeoutMinutes: z.number().min(1).default(30),
		})
		.default({}),
	server: z
		.object({
			port: z.number().default(7474),
			host: z.string().default('localhost'),
		})
		.default({}),
	github: z
		.object({
			createPrs: z.boolean().default(true),
			prPrefix: z.string().default('[Vigil]'),
		})
		.default({}),
})

export type VigilConfig = z.infer<typeof configSchema>
export type ProjectConfig = z.infer<typeof projectSchema>

export function loadConfig(configPath?: string): VigilConfig {
	const path = configPath ?? process.env.VIGIL_CONFIG ?? resolve(process.cwd(), 'vigil.config.json')
	const raw = readFileSync(path, 'utf-8')
	const json = JSON.parse(raw)
	return configSchema.parse(json)
}
