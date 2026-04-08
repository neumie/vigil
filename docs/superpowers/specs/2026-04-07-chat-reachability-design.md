# Chat Reachability: Tunnel + Task Comments

## Problem

The chat clarification feature has three gaps:
1. The chat link isn't posted where the requester can see it (only a generic webhook)
2. The Vigil server runs locally — requesters can't reach the chat UI
3. No direct notification to the person who created the task

## Solution

### 1. Post chat link as a comment on the source task

When Claude calls `vigil_create_chat`, the MCP handler:
- Looks up `db.getTask(taskId)` to get `clientcareId`
- Calls `provider.postComment(clientcareId, message)` with the chat URL
- Also fires the webhook if configured (kept for Slack/Discord backup)

**Changes:**
- `src/mcp/server.ts` — add `provider: TaskProvider` param to `createMcpServer()`, call `postComment` inside `vigil_create_chat`
- `src/server/app.ts` — pass `provider` through to `createMcpServer()`

### 2. Cloudflare quick tunnel for public access

On daemon startup (when `chat.tunnel` is enabled):
- Spawn `cloudflared tunnel --url localhost:{port}`
- Parse stdout/stderr for the `*.trycloudflare.com` URL
- Override `chat.baseUrl` with the tunnel URL
- Kill the tunnel process on shutdown

**Changes:**
- `src/config.ts` — add `tunnel: z.boolean().default(false)` to chat config
- `src/tunnel.ts` (new) — `startTunnel(port): Promise<{ url: string, stop: () => void }>` — spawns cloudflared, parses URL, returns cleanup function
- `src/index.ts` — start tunnel before MCP server init if `chat.tunnel` is true, pass URL as `chat.baseUrl`

### 3. No frontend changes needed

The chat UI already works — it just needs to be reachable. The tunnel handles that.

## Verification

1. Start Vigil with `chat.tunnel: true` — check that a trycloudflare.com URL is logged
2. Trigger a vague task — check that a comment appears on the Contember task with the chat link
3. Open the link from another device — chat UI loads and works
4. Stop Vigil — tunnel process is killed
