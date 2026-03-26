# Generic Provider Interface Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the provider interface fully generic by introducing a separate transformer layer and removing domain-specific assumptions from `TaskContext`.

**Architecture:** Provider fetches and normalizes source data into a generic `TaskContext` (title, description, metadata key-values, comments, attachments, projectContext). At solve time, a transformer converts `TaskContext` into a prompt string. The default transformer formats whatever fields are present.

**Tech Stack:** TypeScript, Zod

---

### File Structure

| Action | File | Responsibility |
|--------|------|----------------|
| Modify | `src/providers/provider.ts` | Replace current `TaskContext` with generic shape |
| Create | `src/transformers/transformer.ts` | `TaskTransformer` type + `getTransformer()` lookup |
| Create | `src/transformers/default.ts` | Generic transformer that formats any `TaskContext` into prompt text |
| Modify | `src/solver/prompt-builder.ts` | Simplify to: get transformer, call it, prepend solver instructions |
| Modify | `src/providers/contember.ts` | Update `getTaskContext()` to return new `TaskContext` shape |
| Modify | `src/config.ts` | Add `solver.transformer` field |
| Modify | `src/queue/worker.ts` | Pass transformer name from config to `buildPrompt` |

---

### Task 1: Replace TaskContext with generic shape

**Files:**
- Modify: `src/providers/provider.ts`

- [ ] **Step 1: Replace the `TaskContext` interface**

Replace the entire contents of `src/providers/provider.ts` with:

```ts
/**
 * A discovered task from the external source.
 * Minimal info needed to decide whether to enqueue it.
 */
export interface DiscoveredTask {
	externalId: string
	title: string
	createdAt: string
}

/**
 * Vigil's canonical internal representation of a task.
 * Each provider normalizes its native data into this shape.
 * All fields optional except title — providers fill in what they can.
 */
export interface TaskContext {
	title: string
	description?: string
	metadata?: Record<string, string>
	comments?: Array<{ author: string; createdAt: string; body: string }>
	attachments?: Array<{ name: string; url: string }>
	projectContext?: string
}

/**
 * Abstract interface that all task sources must implement.
 */
export interface TaskProvider {
	readonly name: string
	pollNewTasks(projectSlug: string, since: string): Promise<DiscoveredTask[]>
	getTaskContext(externalId: string): Promise<TaskContext | null>
	postComment(externalId: string, markdown: string): Promise<string | null>
}
```

- [ ] **Step 2: Verify the file compiles**

Run: `npx tsc --noEmit 2>&1 | head -30`
Expected: Errors in `contember.ts` and `prompt-builder.ts` (they reference old fields). That's correct — we'll fix those next.

- [ ] **Step 3: Commit**

```bash
git add src/providers/provider.ts
git commit -m "refactor(providers): replace TaskContext with generic shape"
```

---

### Task 2: Create the transformer layer

**Files:**
- Create: `src/transformers/transformer.ts`
- Create: `src/transformers/default.ts`

- [ ] **Step 1: Create the transformer type and registry**

Create `src/transformers/transformer.ts`:

```ts
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
```

- [ ] **Step 2: Create the default transformer**

Create `src/transformers/default.ts`:

```ts
import type { TaskContext } from '../providers/provider.js'

export function defaultTransformer(task: TaskContext): string {
	let context = ''

	if (task.projectContext) {
		context += `Project Context:\n${task.projectContext}\n\n`
	}

	context += `Task: ${task.title}\n`

	if (task.metadata && Object.keys(task.metadata).length > 0) {
		for (const [key, value] of Object.entries(task.metadata)) {
			context += `${key}: ${value}\n`
		}
	}

	if (task.description) {
		context += `\nDescription:\n${task.description}\n`
	}

	if (task.attachments && task.attachments.length > 0) {
		context += '\nAttachments:\n'
		for (const a of task.attachments) {
			context += `- ${a.name} -> ${a.url}\n`
		}
	}

	if (task.comments && task.comments.length > 0) {
		context += `\nComments (${task.comments.length}):\n`
		for (const c of task.comments) {
			context += `\n- [${c.createdAt}] ${c.author}\n${c.body || '(no text)'}\n`
		}
	}

	return context
}
```

- [ ] **Step 3: Verify new files compile**

Run: `npx tsc --noEmit 2>&1 | grep transformers`
Expected: No errors in transformer files.

- [ ] **Step 4: Commit**

```bash
git add src/transformers/transformer.ts src/transformers/default.ts
git commit -m "feat(transformers): add transformer layer with default implementation"
```

---

### Task 3: Update prompt-builder to use transformers

**Files:**
- Modify: `src/solver/prompt-builder.ts`
- Modify: `src/config.ts`
- Modify: `src/queue/worker.ts`

- [ ] **Step 1: Add transformer config field**

In `src/config.ts`, add `transformer` to the solver schema. Change:

```ts
	solver: z
		.object({
			concurrency: z.number().min(1).max(10).default(2),
			model: z.string().optional(),
			maxBudgetUsd: z.number().optional(),
			timeoutMinutes: z.number().min(1).default(30),
		})
		.default({}),
```

To:

```ts
	solver: z
		.object({
			concurrency: z.number().min(1).max(10).default(2),
			model: z.string().optional(),
			maxBudgetUsd: z.number().optional(),
			timeoutMinutes: z.number().min(1).default(30),
			transformer: z.string().default('default'),
		})
		.default({}),
```

- [ ] **Step 2: Rewrite prompt-builder.ts**

Replace the entire contents of `src/solver/prompt-builder.ts` with:

```ts
import type { TaskContext } from '../providers/provider.js'
import { getTransformer } from '../transformers/transformer.js'

const SOLVER_INSTRUCTIONS = `You are solving a task from a project management system. Read the task context below, then follow these steps:

## Step 1: Explore the codebase
- Read CLAUDE.md if it exists
- Understand the project structure, conventions, and tech stack
- Find code relevant to the task

## Step 2: Assess complexity
Based on the task description and your codebase exploration, classify this task into one of four tiers:

- **TRIVIAL**: Simple, well-defined change. Examples: typo fix, copy change, config update, adding a straightforward field. You are highly confident you can solve it completely and correctly.
- **SIMPLE**: Clear requirement with a bounded scope. Examples: adding a new API endpoint following existing patterns, implementing a form field, writing a utility function. You can solve it fully but it requires some thought.
- **COMPLEX**: Multi-step change, touches multiple modules, or has notable uncertainty. Examples: refactoring, new feature with edge cases, performance optimization. You should attempt a partial solution and document what remains.
- **UNCLEAR**: Key details are missing. The task cannot be meaningfully started without clarification. Do NOT attempt any code changes.

## Step 3: Take action based on tier

### If TRIVIAL or SIMPLE:
- Implement the complete solution
- Make clean, focused commits
- Ensure existing patterns are followed
- Run any available linters/formatters

### If COMPLEX:
- Implement as much as you reasonably can
- Focus on the core changes, note what remains
- Make clean commits for what you completed
- Write a detailed analysis of remaining work

### If UNCLEAR:
- Do NOT make any code changes
- Write a detailed analysis of what information is missing
- List specific questions that need answers

## Step 4: Write result file
When finished, create a file called \`.solver-result.json\` in the repository root with this exact structure:

\`\`\`json
{
  "tier": "trivial|simple|complex|unclear",
  "confidence": 0.0-1.0,
  "summary": "Brief description of what was done or analyzed",
  "filesChanged": ["path/to/file1.ts", "path/to/file2.ts"],
  "analysis": "Detailed analysis (for complex/unclear tiers)",
  "questionsForRequester": ["Question 1?", "Question 2?"],
  "remainingWork": ["Item 1", "Item 2"],
  "prReady": true|false,
  "prTitle": "Suggested PR title",
  "prBody": "Suggested PR body in markdown"
}
\`\`\`

Set \`prReady\` to:
- \`true\` for TRIVIAL (merge-ready PR)
- \`true\` for SIMPLE (draft PR)
- \`false\` for COMPLEX (branch only, no PR)
- \`false\` for UNCLEAR (no code changes)

---

`

export function buildPrompt(task: TaskContext, transformerName: string): string {
	const transformer = getTransformer(transformerName)
	const taskContextStr = transformer(task)
	return `${SOLVER_INSTRUCTIONS}## Task Context\n\n${taskContextStr}`
}
```

- [ ] **Step 3: Update worker.ts to pass transformer name**

In `src/queue/worker.ts`, change line 32:

```ts
		const prompt = buildPrompt(taskContext)
```

To:

```ts
		const prompt = buildPrompt(taskContext, config.solver.transformer)
```

- [ ] **Step 4: Verify compilation**

Run: `npx tsc --noEmit 2>&1 | head -30`
Expected: Errors only in `contember.ts` (still returning old shape). Everything else should compile.

- [ ] **Step 5: Commit**

```bash
git add src/solver/prompt-builder.ts src/config.ts src/queue/worker.ts
git commit -m "refactor(prompt-builder): use transformer layer instead of hardcoded formatting"
```

---

### Task 4: Update ContemberProvider to return new TaskContext

**Files:**
- Modify: `src/providers/contember.ts`

- [ ] **Step 1: Rewrite getTaskContext()**

In `src/providers/contember.ts`, replace the `getTaskContext` method (lines 113-165) with:

```ts
	async getTaskContext(externalId: string): Promise<TaskContext | null> {
		const data = await this.query<{ getTask: RawTaskFull | null }>(GET_TASK_CONTEXT, {
			taskId: externalId,
		})

		const t = data.getTask
		if (!t) return null

		const metadata: Record<string, string> = {}
		if (t.status) metadata.status = t.status
		if (t.priority) metadata.priority = t.priority
		if (t.dueDate) metadata['due date'] = t.dueDate
		if (t.timeEstimate) metadata['time estimate'] = `${t.timeEstimate}h`
		if (t.module?.name) metadata.module = t.module.name

		const comments =
			t.comments
				?.map(c => ({
					author: c.person?.tenantPerson?.name ?? c.person?.tenantPerson?.email ?? 'Unknown',
					createdAt: c.createdAt ?? '',
					body: c.content?.data ? extractPlainText(c.content.data) : '',
				}))
				.filter(c => c.body) ?? []

		const attachments: Array<{ name: string; url: string }> = []
		if (t.description?.references) {
			for (const ref of t.description.references) {
				if (ref?.file?.url) {
					attachments.push({
						name: ref.file.fileName ?? 'file',
						url: ref.file.url,
					})
				}
			}
		}

		let projectContext: string | undefined
		if (t.project) {
			const parts: string[] = []
			parts.push(`Project: ${t.project.name ?? ''} (slug: ${t.project.slug ?? ''})`)
			if (t.project.description?.data) {
				const desc = extractPlainText(t.project.description.data)
				if (desc) parts.push(`\nProject Description:\n${desc}`)
			}
			const contexts = t.project.contexts ?? []
			if (contexts.length > 0) {
				parts.push('\nProject Context Documents:')
				for (const ctx of contexts) {
					if (ctx.markdown) {
						const body = ctx.markdown.slice(0, 3000) + (ctx.markdown.length > 3000 ? '...' : '')
						parts.push(`\n### ${ctx.title ?? 'Untitled'}\n${body}`)
					}
				}
			}
			projectContext = parts.join('\n')
		}

		return {
			title: t.title ?? '',
			description: t.description?.data ? extractPlainText(t.description.data) : undefined,
			metadata: Object.keys(metadata).length > 0 ? metadata : undefined,
			comments: comments.length > 0 ? comments : undefined,
			attachments: attachments.length > 0 ? attachments : undefined,
			projectContext,
		}
	}
```

- [ ] **Step 2: Verify full compilation**

Run: `npx tsc --noEmit`
Expected: Clean — no errors.

- [ ] **Step 3: Verify with lint**

Run: `npm run lint`
Expected: Clean or only pre-existing warnings.

- [ ] **Step 4: Commit**

```bash
git add src/providers/contember.ts
git commit -m "refactor(contember): map to generic TaskContext shape"
```

---

### Task 5: Clean up and verify

**Files:**
- Modify: `src/providers/contember.ts` (remove unused imports if any)

- [ ] **Step 1: Build the project**

Run: `npm run build`
Expected: Clean compilation to `dist/`.

- [ ] **Step 2: Run lint with fix**

Run: `npm run lint:fix`
Expected: Clean.

- [ ] **Step 3: Commit any lint fixes**

If lint produced changes:
```bash
git add -u
git commit -m "chore: lint fixes"
```

If no changes, skip this step.
