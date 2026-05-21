import type { VigilConfig } from '../config.js'
import { log } from '../util/logger.js'
import { DefaultSolver } from './default-solver.js'
import type { Solver } from './solver.js'

/**
 * The single construction site for the active {@link Solver}, mirroring
 * `providers/registry.ts` for the provider seam.
 *
 * Concentrates two invariants the daemon and the CLI both depended on but
 * implemented separately (and divergently):
 *
 *  1. **Optional extension solvers load via dynamic `import()`, never a static
 *     one.** A top-level static import of an extension solver (e.g. okena) would
 *     crash startup if its optional dependency is unavailable. Only `default` is
 *     statically importable.
 *  2. **Silent fallback to `DefaultSolver`.** If the configured type is `okena`
 *     but Okena is unavailable, fall back to the default solver and *log it* —
 *     so the configured type is not assumed to be the active type. (Previously
 *     `index.ts` logged this and `cli/vigil.ts` swallowed it with an empty
 *     `catch {}`, leaving the operator no signal that okena fell back.)
 *
 * To add a backend: extend the `solver.type` enum in `config.ts`, then add a
 * branch here that dynamically imports its `createX(config)` factory.
 */
export async function createSolver(config: VigilConfig): Promise<Solver> {
	if (config.solver.type === 'okena') {
		try {
			const { createOkenaSolver } = await import('../extensions/okena/solver.js')
			const solver = await createOkenaSolver(config)
			log.success('vigil', 'Solver: Okena (tasks will be visible in Okena)')
			return solver
		} catch (err) {
			log.warn(
				'vigil',
				`Okena solver unavailable, falling back to default: ${err instanceof Error ? err.message : err}`,
			)
			return new DefaultSolver(config)
		}
	}

	return new DefaultSolver(config)
}
