# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What is Vigil

Vigil is an AI-powered task automation daemon. It polls an external task source (via a pluggable provider system) for new tasks, invokes Claude Code CLI to analyze and solve them, classifies complexity into tiers (trivial/simple/complex/unclear), and takes appropriate actions (create PRs, post comments, request clarification). A React dashboard provides real-time monitoring. Currently supports Contember CMS as a task source, with the provider interface designed for adding others (GitHub Issues, Linear, etc.).

## Commands

```bash
# Backend
npm run dev          # Run with tsx watch mode
npm run build        # TypeScript compile to dist/
npm run start        # Run compiled dist/index.js
npm run lint         # Biome check
npm run lint:fix     # Biome check --fix

# Frontend (web/)
npm run dev:web      # Vite dev server on :7475 (proxies /api to :7474)
npm run build:web    # Vite production build
```

No test framework is configured yet.

## Configuration

Config loads from `VIGIL_CONFIG` env var path or `./vigil.config.json` (see `vigil.config.example.json`). Validated with Zod in `src/config.ts`. The `provider` field is a discriminated union keyed on `type` (currently only `"contember"`). Other key settings: project repos, polling interval, solver concurrency/timeout/model, GitHub PR options, server port (default 7474).

## Architecture

**Data flow:** Task Source (via Provider) → Poller → DB + Queue → Worker → Claude CLI → Result Parser → Action Dispatcher → PRs/Comments back to source

### Provider system (`src/providers/`)

The `TaskProvider` interface (`provider.ts`) abstracts all interaction with external task sources. Core methods: `pollNewTasks()`, `getTaskContext()`, `postComment()`. Each provider maps its native format to provider-agnostic types (`DiscoveredTask`, `TaskContext`). The registry (`registry.ts`) is a factory that instantiates the correct provider from config. Currently only `ContemberProvider` (`contember.ts`) exists — it contains all Contember-specific logic including GraphQL queries and SlateJS conversion.

To add a new provider: implement `TaskProvider`, add its config to the discriminated union in `src/config.ts`, and register it in `src/providers/registry.ts`.

### Core pipeline (`src/queue/worker.ts`)

The worker processes tasks in 5 phases:
1. **Poll** — fetch full task context via provider's `getTaskContext()`
2. **Worktree** — create isolated git worktree for the task
3. **Solve** — invoke `claude` CLI with a constructed prompt, collect output
4. **Parse** — read `.solver-result.json` from worktree (fallback: parse stdout)
5. **Action** — dispatch based on tier: trivial→ready PR, simple→draft PR, complex→push branch, unclear→post questions

### Key modules

- **`src/poller/poller.ts`** — interval-based polling via provider, tracks `lastTaskSeen` timestamp to avoid duplicates
- **`src/queue/queue.ts`** — concurrent task processing with configurable concurrency limit
- **`src/solver/invoker.ts`** — spawns `claude` CLI, passes prompt via stdin, respects timeout
- **`src/solver/prompt-builder.ts`** — constructs the full prompt from provider-agnostic `TaskContext`, including tier definitions
- **`src/solver/result-parser.ts`** — Zod-validated parsing of `.solver-result.json` with stdout fallback
- **`src/actions/dispatcher.ts`** — routes completed tasks to PR creation (`gh` CLI) or source comments via provider
- **`src/worktree/manager.ts`** — creates/pushes git worktrees per task
- **`src/db/client.ts`** — SQLite (better-sqlite3) wrapper for tasks, poll state, event log
- **`src/server/`** — Hono API serving task data, queue status, stats; serves the web dashboard

### Frontend (`web/`)

React 19 + TypeScript + Vite. Dashboard polls the API every 5 seconds. Main views: `Dashboard.tsx` (task list with stats cards) and `TaskDetail.tsx` (timeline, files changed, metadata). Status/tier badges use color coding (green=trivial, blue=simple, amber=complex, red=unclear).

## Code Style

- Biome: tabs, single quotes, no semicolons, 120 char line width
- TypeScript strict mode, ES2022 target, Node16 modules
