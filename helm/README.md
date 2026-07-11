# helm

Orchestrator cockpit for the vigil daemon — and THE vigil UI (the browser
dashboard `web/` is deleted; the daemon is API-only). Electron app with a
resizable split: left pane is the native React sidebar (`src/renderer/sidebar/`,
list/detail/settings), right pane is a real terminal (xterm.js + node-pty) for
claude chats and `vigil ingest`.

All daemon traffic goes through the main-process `VigilBridge` (`src/vigil-bridge.ts`):
one 2.5s poller pushes full `vigil:snapshot` updates over IPC when state changes, and
commands proxy single HTTP calls (the `file://` renderer never fetches `:7474` itself).
Wire types are copied into `src/shared-vigil.ts` from the server contract.

helm registers the `vigil://` URL scheme (`src/main.ts`): `vigil://item/<id>` —
emitted by the Chrome extension's "Helm ↗" link — focuses the window and jumps
the sidebar to that item (`src/protocol.ts` parses; `nav:open-item` IPC).
Unpackaged dev runs may fail to claim the scheme on macOS (logged warning).

## Install

```sh
bun install && bun run rebuild
```

`rebuild` compiles node-pty against Electron's ABI (also runs on postinstall).

## Run

```sh
bun run start
```

Daemon URL comes from `VIGIL_URL` (default `http://localhost:7474`). If the daemon is
down, the topbar dot breathes amber and the bridge keeps polling until it is reachable.
Shortcuts: cmd+t new terminal tab, cmd+w close tab. Divider position persists.
