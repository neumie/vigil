# Vigil

AI-powered task automation daemon. Polls external task sources for new tasks, invokes Claude Code to analyze and solve them, classifies complexity into tiers, and takes appropriate actions — creating PRs, pushing branches, or requesting clarification.

## How it works

```
Task Source → Poller → Queue → Claude Code → Result Parser → PRs / Comments
```

1. **Poll** — discovers new tasks from an external source (currently Contember CMS)
2. **Queue** — manages concurrent processing with configurable limits
3. **Solve** — creates an isolated git worktree, runs Claude Code with a structured prompt
4. **Classify** — parses Claude's assessment into tiers:
   - **Trivial** → merge-ready PR
   - **Simple** → draft PR for review
   - **Complex** → branch + detailed analysis
   - **Unclear** → posts clarifying questions back to source
5. **Act** — creates PRs via `gh` CLI, posts comments via the provider API

A React dashboard at `localhost:7474` provides real-time monitoring with live output streaming, task cancellation, and retry.

## Prerequisites

- Node.js 20+
- `claude` CLI ([Claude Code](https://claude.ai/code)) installed and authenticated
- `gh` CLI for PR creation
- Git

## Setup

```bash
npm install
cp vigil.config.example.json vigil.config.json
# Edit vigil.config.json with your provider credentials and project paths
```

## Configuration

`vigil.config.json` (validated with Zod):

| Field | Description |
|-------|-------------|
| `provider` | Task source config — `type`, credentials, `taskBaseUrl` for dashboard links |
| `projects` | Array of repos to work on — `slug`, `repoPath`, `baseBranch` |
| `polling.intervalSeconds` | How often to check for new tasks (default: 60) |
| `polling.since` | ISO date to start polling from (avoids processing old tasks) |
| `solver.type` | `"default"` (headless) or `"okena"` (visible in Okena terminal) |
| `solver.concurrency` | Max concurrent tasks (default: 2) |
| `solver.timeoutMinutes` | Per-task timeout (default: 30) |
| `solver.model` | Claude model override (optional) |
| `github.createPrs` | Enable/disable PR creation (default: true) |
| `github.postComments` | Enable/disable posting back to source (default: true) |
| `github.prPrefix` | PR title prefix (default: `[Vigil]`) |

## Running

```bash
# Development (hot reload)
npm run dev

# Production daemon (macOS launchd)
make install       # build + link CLI + start daemon
vigil status       # check if running
vigil logs         # tail stdout
vigil logs --err   # tail stderr
vigil stop         # stop daemon
make restart       # rebuild + restart
make uninstall     # stop + unlink
```

Dashboard: **http://localhost:7474**

## Okena integration

When `solver.type` is set to `"okena"`, Vigil creates worktrees and runs Claude inside visible [Okena](https://github.com/nickarora/okena) terminal panes — you can watch and interact with Claude as it works. Falls back to headless mode if Okena isn't running.

Requires Okena's remote server enabled (`remote_server_enabled: true` in Okena settings).

## Architecture

```
src/
  providers/       # Task source abstraction (Contember, future: GitHub, Linear)
  poller/          # Interval-based task discovery
  queue/           # Concurrent task processing
  solver/          # Solver interface, default (headless) + invoker
  extensions/      # Optional integrations (Okena terminal)
  actions/         # PR creation, comment posting
  worktree/        # Git worktree lifecycle
  db/              # SQLite persistence
  server/          # Hono API + static dashboard serving
web/               # React dashboard (Vite)
```

## Adding a provider

1. Implement `TaskProvider` interface (`src/providers/provider.ts`)
2. Add provider config to the discriminated union in `src/config.ts`
3. Register in `src/providers/registry.ts`
