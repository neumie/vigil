import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { type SolverResult, solverResultSchema } from '../solver/result-schema.js'
import { log } from '../util/logger.js'

/**
 * Relative-to-worktree paths (POSIX separators — safe to embed in prompts and
 * `$(cat ...)` shell commands) for a task's plan directory.
 */
export function planPaths(planDirName: string) {
	const dir = `docs/plans/${planDirName}`
	return {
		dir,
		context: `${dir}/context.md`,
		planningPrompt: `${dir}/.planning-prompt.txt`,
		result: `${dir}/solver-result.json`,
		readme: `${dir}/README.md`,
	}
}

/**
 * Deep module owning the on-disk `docs/plans/<planDirName>/` layout. The single
 * place that knows where `context.md` / `.planning-prompt.txt` /
 * `solver-result.json` / `README.md` live, so the solver prompt, the result
 * reader, and the okena poll path can never disagree about paths.
 *
 * Concerns the on-disk layout only — formatting of file *contents*
 * (`formatTaskContext`, prompt building) stays with the caller, which keeps this
 * module free of upward dependencies.
 */
export class PlanWorkspace {
	/** Relative-to-worktree paths, for prompts and shell commands. */
	readonly rel: ReturnType<typeof planPaths>

	constructor(
		private readonly worktreePath: string,
		readonly planDirName: string,
	) {
		this.rel = planPaths(planDirName)
	}

	get dir(): string {
		return join(this.worktreePath, this.rel.dir)
	}
	get contextPath(): string {
		return join(this.worktreePath, this.rel.context)
	}
	get planningPromptPath(): string {
		return join(this.worktreePath, this.rel.planningPrompt)
	}
	get resultPath(): string {
		return join(this.worktreePath, this.rel.result)
	}
	get readmePath(): string {
		return join(this.worktreePath, this.rel.readme)
	}

	ensureDir(): void {
		mkdirSync(this.dir, { recursive: true })
	}

	/** Write `context.md` (caller passes already-formatted markdown). */
	writeContext(content: string): void {
		this.ensureDir()
		writeFileSync(this.contextPath, content, 'utf-8')
	}
	writePlanningPrompt(content: string): void {
		this.ensureDir()
		writeFileSync(this.planningPromptPath, content, 'utf-8')
	}
	writeReadme(content: string): void {
		this.ensureDir()
		writeFileSync(this.readmePath, content, 'utf-8')
	}

	resultExists(): boolean {
		return existsSync(this.resultPath)
	}

	/**
	 * Delete any stale `solver-result.json` left in a reused worktree by a prior
	 * run. Call BEFORE solving: okena's poll loop waits on `resultExists()`, and a
	 * leftover result makes it exit instantly — reporting the old result as success
	 * and (worse) racing the freshly-launched agent's `cat` of the prompt file to
	 * deletion. `force: true` no-ops when absent.
	 */
	clearResult(): void {
		rmSync(this.resultPath, { force: true })
	}

	/** Read + validate `solver-result.json`. Null if absent or invalid. */
	readResult(): SolverResult | null {
		try {
			return solverResultSchema.parse(JSON.parse(readFileSync(this.resultPath, 'utf-8')))
		} catch (err) {
			log.warn('plan-workspace', `Could not read ${this.resultPath}`, err)
			return null
		}
	}

	/**
	 * Concatenate every `*.md` artifact in the plan dir (oldest-first by mtime),
	 * each wrapped in a `<plan_artifact>` block. Null if the dir is absent/empty.
	 */
	readArtifacts(): string | null {
		if (!existsSync(this.dir)) return null

		const entries = readdirSync(this.dir)
			.filter(name => name.endsWith('.md'))
			.map(name => {
				const fullPath = join(this.dir, name)
				return { name, fullPath, mtime: statSync(fullPath).mtimeMs }
			})
			.sort((a, b) => a.mtime - b.mtime)

		if (entries.length === 0) return null

		let out = ''
		for (const entry of entries) {
			const content = readFileSync(entry.fullPath, 'utf-8')
			const mtimeIso = new Date(entry.mtime).toISOString()
			out += `<plan_artifact path="${this.rel.dir}/${entry.name}" mtime="${mtimeIso}">\n${content}\n</plan_artifact>\n\n`
		}
		return out
	}
}
