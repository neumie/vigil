## Problem Statement

Vigil still runs on a pre-rework Task model: one external-source Task becomes one solve-style run, the queue has one concurrency pool, planning is coupled to Solver, and the dashboard renders raw persistence fields with duplicated rules in web and extension clients. The target product is an AFK list where the operator can add or approve different Item kinds, fan out parallel attempts, fork work from another Item, plan separately from execution, and monitor solve and almanac loop runs through one dashboard.

The current architecture makes that rework hard because lifecycle behavior is spread across route handlers, the CLI, the poller, the queue, DB writes, solver adapters, dashboard components, and extension code. Adding Item kinds would copy the same status, planning, dispatch, and display rules into many places.

## Solution

Rework Vigil around Item as the core domain object. Item Store owns persistence, Item Commands own lifecycle behavior, Drainer owns lane-aware scheduling, Solver remains solve-kind execution only, loop execution shells out to almanac, and Spawner owns interactive planning. Dashboard clients render a server-owned Dashboard Contract and Run Observation instead of raw DB rows.

This PRD treats the AFK rework as a breaking storage reset. Old Task rows, tiering fields, and chat tables do not need in-place migration. The implementation should make the new modules deep: callers learn small interfaces, while status transitions, payload validation, workspace identity, planning, dispatch, observation, and UI action rules concentrate behind those interfaces.

## User Stories

1. As an operator, I want to add a solve Item from the dashboard, so that Vigil can ship a PR from a free-form prompt.
2. As an operator, I want to add a ralph Item from the dashboard, so that Vigil can delegate PRD execution to almanac.
3. As an operator, I want to add a harden Item from the dashboard, so that Vigil can delegate hardening rounds to almanac.
4. As an operator, I want hand-added Items to start as queued by default, so that I can use Vigil without an external source.
5. As an operator, I want poller-discovered Items to start as unverified, so that ambiguous external work does not run without triage.
6. As an operator, I want to approve an unverified Item, so that it enters the queue.
7. As an operator, I want to reject an unverified Item, so that it is recorded as skipped.
8. As an operator, I want each Item to carry Source when it came from a provider, so that I can navigate back to the original task.
9. As an operator, I want Items without Source to be valid, so that dashboard-created work is first-class.
10. As an operator, I want to choose a BaseRef when creating an Item, so that each attempt starts from the right git ref.
11. As an operator, I want queued Items to keep their explicit BaseRef even if config changes later, so that queued work does not move under my feet.
12. As an operator, I want to fork a new Item from an existing Item branch, so that I can try follow-up work or alternate attempts from a known state.
13. As an operator, I want to fan out N parallel Items with a shared GroupId, so that I can compare multiple attempts.
14. As an operator, I want one failed child in a group not to cancel siblings, so that each attempt remains independent.
15. As an operator, I want grouped Items to render together, so that comparison is easier.
16. As an operator, I want solve and loop Items to use separate lane capacity, so that a long loop cannot starve short solve Items.
17. As an operator, I want Items in each lane to run oldest queued first, so that scheduling is predictable.
18. As an operator, I want to pause and resume the Drainer, so that I can control when queued work starts.
19. As an operator, I want to cancel queued or running Items, so that I can stop work I no longer want.
20. As an operator, I want cancellation to preserve worktrees, so that partial work can be inspected.
21. As an operator, I want to retry failed, skipped, cancelled, or completed Items, so that I can rerun work without recreating it.
22. As an operator, I want planning to be available separately from execution, so that I can explore scope before queueing or running.
23. As an operator, I want planning to work for any Item kind, so that solve, ralph, and harden Items can all get plan artifacts.
24. As an operator, I want to choose a Spawner per Item, so that planning opens in my preferred interactive surface.
25. As an operator, I want available Spawners to match files installed in the repo, so that adding a Spawner is an adapter addition, not a schema change.
26. As an operator, I want repeated Plan clicks to reuse the same planning context when possible, so that I do not create duplicate planning sessions.
27. As an operator, I want plan artifacts to live under the Item plan directory, so that execution can consume the decisions later.
28. As an operator, I want solve execution to reuse the planned worktree, so that planning artifacts survive into the autonomous run.
29. As an operator, I want loop execution to reuse the planned worktree when present, so that almanac sees the same repo state.
30. As an operator, I want solve Items to go through Solver only, so that solve execution stays isolated from almanac loop execution.
31. As an operator, I want ralph and harden Items to shell out to almanac, so that loop behavior stays owned by almanac.
32. As an operator, I want Vigil to capture AlmanacRunId for loop Items, so that the dashboard can follow canonical almanac run state.
33. As an operator, I want solve prompt snapshots to reflect exactly what was handed to the agent, so that debugging does not depend on mutable plan artifacts.
34. As an operator, I want solve results to read from the result file only, so that behavior is consistent across default and Okena solvers.
35. As an operator, I want Dispatch to record a pre-shipped PR when the agent already shipped, so that Vigil does not duplicate PR work.
36. As an operator, I want Dispatch to push and open a PR when the agent did not ship one, so that solve Items still end in review.
37. As an operator, I want provider comments posted only when configured, so that external-source behavior respects project config.
38. As an operator, I want live solve output, solve timeline, PR status, and almanac loop state to appear through one run view, so that I do not need to understand the execution backend.
39. As an operator, I want dashboard action buttons to match Item state and kind, so that invalid actions are not offered.
40. As an operator, I want web and extension UI to agree on labels, tones, and allowed actions, so that the system feels consistent.
41. As an operator, I want Settings to edit only real config fields, so that stale fields do not silently disappear.
42. As an operator, I want config redaction and dashboard-safe config shape to be owned by one module, so that secrets do not leak.
43. As a developer, I want Item Store to validate envelope and payload shape, so that invalid rows fail at one seam.
44. As a developer, I want Item Commands to be the only write path for lifecycle behavior, so that status and event bugs concentrate in one module.
45. As a developer, I want route handlers, CLI commands, poller ingestion, and extension calls to be adapters over Item Commands, so that behavior does not drift.
46. As a developer, I want Spawner separate from Solver, so that adding iTerm or tmux planning does not touch solve execution.
47. As a developer, I want Agent Adapter to own Claude/Codex variation, so that CLI flags, labels, interactive commands, and timeline parsing do not spread across Solver code.
48. As a developer, I want Run Observation to normalize solve and loop state, so that UI does not learn backend-specific file/log formats.
49. As a developer, I want Dashboard Contract to be server-owned, so that web and extension clients do not duplicate domain rules.
50. As a developer, I want the AFK rework documented in ADR and CONTEXT, so that future agents do not reintroduce Task/tier/chat assumptions.

## Implementation Decisions

- Item replaces Task as the core domain object.
- This is a breaking storage rework. Existing local DB data may be discarded. Old Task rows, tiering columns, solver confidence, and chat tables are not preserved.
- Item Store is the persistence module. Its interface should let callers add, load, list, update lifecycle fields, and persist observations without knowing table layout.
- Item Store uses one envelope row with queryable lifecycle columns and one Zod-validated JSON payload column.
- Item envelope includes identity, kind, status, project slug, title, optional Source, BaseRef, optional GroupId, branch/worktree/plan identity, optional AlmanacRunId, timestamps, error state, and result/dispatch state.
- Item payload is a discriminated union keyed by kind. Solve payload contains prompt. Ralph payload mirrors almanac ralph flags. Harden payload mirrors almanac harden flags.
- Kind-specific payload fields remain in JSON until a field needs indexed querying.
- Source is optional. Poller-created Items have Source; hand-added Items have null Source.
- BaseRef is explicit per Item and defaults from project config only at creation time.
- GroupId is only a rendering and comparison hint. It is not a lifecycle join.
- Triage is modeled as Item status: unverified Items can be approved to queued or rejected to skipped.
- Drainer replaces the old single solve queue concept. It schedules queued Items by lane caps and queuedAt ascending.
- Lanes are per kind category: solve lane and loop lane. Solve and loop Items do not share capacity.
- Item Commands is the application module for lifecycle behavior. It owns add, fan-out, plan, queue, approve, reject, start, retry, cancel, skip, status transitions, and lifecycle event writes.
- HTTP routes, extension endpoints, CLI commands, and poller ingestion are adapters over Item Commands.
- Item Commands should expose results that adapters can return directly without duplicating business rules.
- Solver remains the seam for solve-kind execution only.
- Loop execution is not a Solver adapter. Ralph and harden shell out to almanac and capture AlmanacRunId from the first stdout line.
- Spawner is the seam for interactive planning. Planning is not a Kind, not Solver behavior, and not loop execution.
- Spawner adapters are file-discovered. Config names the default Spawner but does not define the available set.
- PlanWorkspace owns on-disk plan layout and is Item-scoped. Planning artifacts may exist for any Item kind.
- Item workspace identity resolves planDirName, branchName, and existing worktree from an Item row. It is distinct from PlanWorkspace.
- Execution adapters reuse existing worktrees when planning already created them.
- Solve input snapshot is persisted or returned by solve execution before invocation. The dashboard displays the exact snapshot, never a rebuilt prompt.
- SolverResult remains the solve-kind structured result file contract. It is read from the result file only.
- Solve outcome remains solver-owned for solve Items. Loop Items use almanac run records instead.
- Agent Adapter owns Claude/Codex differences inside solve execution: command shape, labels, interactive command construction, and timeline parsing.
- Dispatch owns solve post-run delivery. It records pre-shipped PRs and performs fallback push, PR creation, provider comment, and event writes through internal adapters.
- Run Observation is the read module for live/completed execution state. It normalizes solve logs/events/PR status and almanac status files into one shape.
- Dashboard Contract is the server-owned view model. It includes card state, status tone, allowed actions, source links, branch/PR links, grouping, and run observation summaries.
- React web and Solid extension render Dashboard Contract instead of duplicating persistence types and action logic.
- Config Document owns config load, validation, redaction, dashboard-safe shape, and edit metadata. Settings consumes this rather than mirroring config fields manually.
- Provider remains the seam over external Item sources. Its post-rework job is producing unverified Items and posting comments when configured.
- README and operator docs must be updated to remove tiering/classification/chat claims and describe Item/Kinds/Triage/Lanes.
- ADR-0001 is authoritative for breaking storage, JSON payload, file-discovered Spawners, Item Commands, Dashboard Contract, and Run Observation.

## Testing Decisions

- Test through module interfaces, not internal helper functions. The interface is the test surface.
- Current repo has no established test framework. The first implementation slice should either introduce a minimal test script or explicitly verify with build and end-to-end daemon flows until test infra is added.
- Item Store should have module tests for envelope/payload validation, insert/read/list, Source null handling, BaseRef persistence, GroupId independence, status validation, row corruption rejection, and breaking schema initialization.
- Item Commands should have behavior tests for add, fan-out, triage approve/reject, queue/start/retry/cancel/skip, event writing, and adapter-independent results.
- Drainer should have tests for lane capacity, queuedAt ordering, pause/resume, cancellation, stale processing recovery, and solve-vs-loop isolation.
- Spawner registry should have tests for file-discovered adapter listing, default resolution, missing adapter errors, and per-Item override behavior.
- Planning flow should have tests through Item Commands, using fake Spawner and fake workspace dependencies, to verify worktree reuse and plan artifact writes.
- Solver changes should have tests for solve input snapshot immutability and Agent Adapter selection.
- Loop execution should have tests with fake almanac process output to verify run_id capture, status file path storage, cancellation signal file writes, and clean failure states.
- Dispatch should have tests for pre-shipped PR recording, fallback PR creation, provider comment behavior, disabled PR/comment config, and event writes using fake adapters.
- Run Observation should have fixture tests for solve logs/events/PR status and almanac status.tsv parsing.
- Dashboard Contract should have tests for status tone, allowed actions, grouping, source links, branch/PR links, and observation summaries.
- Config Document should have tests for redaction, defaults, stale-field rejection, and dashboard-safe shape.
- Web and extension UI tests are secondary. Most behavior should be covered before UI through Dashboard Contract tests.
- End-to-end verification should exercise: create solve Item, plan it, queue/start it, observe solve output, dispatch PR; create loop Item, run almanac, observe AlmanacRunId/status; poller-created Item triage.
- `npm run build` remains a required verification step for every slice.

## Out of Scope

- Preserving existing `vigil.db` data.
- Building an in-dashboard branch diff or merge/cherry-pick UI for fan-out results.
- Reimplementing almanac loop logic inside Vigil.
- Reintroducing clarification chat or MCP chat tools.
- Restoring tiering, solver confidence, or tier-routed dispatch.
- Supporting provider kinds beyond context Source.
- Adding public/tunnel extension host permissions.
- Replacing React web or Solid extension frameworks.
- Full visual redesign of the dashboard.
- Installing or vendoring almanac.
- Making every planned future Spawner adapter; only the registry and at least one adapter path are required.

## Further Notes

- Keep Item vocabulary from `CONTEXT.md` in code and docs: Item, Kind, Source, BaseRef, GroupId, Spawner, Triage, Lane, Drainer, Provider, Solver, AlmanacRunId.
- Avoid shallow pass-through modules. Each new module should hide real implementation complexity behind a smaller interface.
- The highest-value first slice is Item Store, then Item Commands. Dashboard and extension work should follow once Dashboard Contract shape stabilizes.
- Planning and execution are separate axes. This is the main design guardrail for the Solver/Spawner split.
- UI should render server-owned decisions. Raw DB rows are persistence facts, not the dashboard interface.
