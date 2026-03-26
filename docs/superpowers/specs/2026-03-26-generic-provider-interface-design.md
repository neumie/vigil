# Generic Provider Interface

## Problem

The current `TaskProvider` interface and `TaskContext` type bake in project-management assumptions (status, priority, dueDate, timeEstimate, module, comments with visibility, project with contextDocs). This prevents Vigil from supporting arbitrary task sources without forcing them into a Contember-shaped mold.

## Architecture

Three layers with clear responsibilities:

```
Source API → Provider (fetch + normalize) → TaskContext → stored in Vigil DB / shown on dashboard
                                                ↓
                                    Transformer (at solve time) → prompt string → Claude CLI
```

1. **Provider** — fetches raw data from the source, normalizes it into `TaskContext`
2. **Vigil core** — stores and displays `TaskContext` (dashboard, DB, branch names, PR titles)
3. **Transformer** — invoked at solve time only, converts `TaskContext` into a prompt string for Claude

Providers and transformers are independent. A generic default transformer handles any provider's output. Custom transformers can be written for specialized formatting.

## Types

### DiscoveredTask

Minimal info returned by polling. Used to decide whether to enqueue.

```ts
interface DiscoveredTask {
  externalId: string
  title: string
  createdAt: string
}
```

### TaskContext

Vigil's canonical internal representation. Rich enough for dashboard display and generic prompt generation. All fields optional except `title`. Each provider fills in what it can.

```ts
interface TaskContext {
  title: string
  description?: string
  metadata?: Record<string, string>
  comments?: Array<{ author: string; createdAt: string; body: string }>
  attachments?: Array<{ name: string; url: string }>
  projectContext?: string
}
```

- `metadata` — flat key-value pairs for structured data (status, priority, due date, module, etc.). Provider-specific keys are fine; the transformer formats whatever is present.
- `projectContext` — freeform string for background info. Contember puts project description + context docs here.
- `comments` — no visibility field; provider decides what to include.
- `attachments` — simplified to name + url.

### TaskProvider

```ts
interface TaskProvider {
  readonly name: string
  pollNewTasks(projectSlug: string, since: string): Promise<DiscoveredTask[]>
  getTaskContext(externalId: string): Promise<TaskContext | null>
  postComment(externalId: string, markdown: string): Promise<string | null>
}
```

No `updateStatus` — removed until needed.

### TaskTransformer

```ts
type TaskTransformer = (task: TaskContext) => string
```

Receives `TaskContext`, returns the task context portion of the prompt. Vigil wraps the result with solver instructions.

## Modules

### Changed

- **`src/providers/provider.ts`** — replace current types with `DiscoveredTask`, `TaskContext`, `TaskProvider` as defined above
- **`src/providers/contember.ts`** — update `getTaskContext()` to return the new `TaskContext` shape. SlateJS extraction stays here. Map Contember fields: status/priority/dueDate/timeEstimate/module go into `metadata`, project description + context docs flatten into `projectContext`, comments drop the visibility field.
- **`src/providers/registry.ts`** — no change (already generic)
- **`src/solver/prompt-builder.ts`** — simplify to: load transformer, call `transformer(taskContext)`, prepend solver instructions. Remove all field-by-field formatting logic.
- **`src/config.ts`** — add `solver.transformer` config field (string, defaults to `"default"`)

### New

- **`src/transformers/transformer.ts`** — exports `TaskTransformer` type and `getTransformer(name: string)` lookup function
- **`src/transformers/default.ts`** — generic transformer that iterates title, description, metadata, comments, attachments, projectContext and formats them into a readable prompt string

### No changes needed

- `src/poller/poller.ts` — already only uses `DiscoveredTask` fields (`externalId`, `title`, `createdAt`)
- `src/actions/dispatcher.ts` — only uses `provider.postComment()`, no change
- `src/queue/worker.ts` — calls `provider.getTaskContext()` then `buildPrompt()`, interface stays the same
- `src/db/` — stores task title and serialized context string, no schema change needed
- `web/` — no changes

## Config

```json
{
  "solver": {
    "transformer": "default"
  }
}
```

The transformer field selects which transformer to use. Omitting it defaults to `"default"`.
