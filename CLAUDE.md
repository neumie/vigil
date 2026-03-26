# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What is Vigil

Vigil is an AI-powered task automation daemon. It polls a Contember CMS for new tasks, invokes Claude Code CLI to analyze and solve them, classifies complexity into tiers (trivial/simple/complex/unclear), and takes appropriate actions (create PRs, post comments, request clarification). A React dashboard provides real-time monitoring.

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

Config loads from `VIGIL_CONFIG` env var path or `./vigil.config.json` (see `vigil.config.example.json`). Validated with Zod in `src/config.ts`. Key settings: Contember connection, project repos, polling interval, solver concurrency/timeout/model, GitHub PR options, server port (default 7474).

## Architecture

**Data flow:** Contember → Poller → DB + Queue → Worker → Claude CLI → Result Parser → Action Dispatcher → PRs/Comments back to Contember

### Core pipeline (`src/queue/worker.ts`)

The worker processes tasks in 5 phases:
1. **Poll** — fetch full task context from Contember via GraphQL
2. **Worktree** — create isolated git worktree for the task
3. **Solve** — invoke `claude` CLI with a constructed prompt, collect output
4. **Parse** — read `.solver-result.json` from worktree (fallback: parse stdout)
5. **Action** — dispatch based on tier: trivial→ready PR, simple→draft PR, complex→push branch, unclear→post questions

### Key modules

- **`src/poller/poller.ts`** — interval-based polling of Contember, tracks `lastTaskSeen` timestamp to avoid duplicates
- **`src/queue/queue.ts`** — concurrent task processing with configurable concurrency limit
- **`src/solver/invoker.ts`** — spawns `claude` CLI, passes prompt via stdin, respects timeout
- **`src/solver/prompt-builder.ts`** — constructs the full prompt including tier definitions and Contember SlateJS→plaintext conversion
- **`src/solver/result-parser.ts`** — Zod-validated parsing of `.solver-result.json` with stdout fallback
- **`src/actions/dispatcher.ts`** — routes completed tasks to PR creation (`gh` CLI) or Contember comments based on tier
- **`src/actions/comment-poster.ts`** — converts markdown to Contember's SlateJS JSON format for comments
- **`src/worktree/manager.ts`** — creates/pushes git worktrees per task
- **`src/db/client.ts`** — SQLite (better-sqlite3) wrapper for tasks, poll state, event log
- **`src/server/`** — Hono API serving task data, queue status, stats; serves the web dashboard

### Frontend (`web/`)

React 19 + TypeScript + Vite. Dashboard polls the API every 5 seconds. Main views: `Dashboard.tsx` (task list with stats cards) and `TaskDetail.tsx` (timeline, files changed, metadata). Status/tier badges use color coding (green=trivial, blue=simple, amber=complex, red=unclear).

## Code Style

- Biome: tabs, single quotes, no semicolons, 120 char line width
- TypeScript strict mode, ES2022 target, Node16 modules
