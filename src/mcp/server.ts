import { randomUUID } from 'node:crypto'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js'
import { z } from 'zod'
import { formatTranscript } from '../chat/format.js'
import { emitSessionEvent, waitForSessionEvent } from '../chat/routes.js'
import { signToken } from '../chat/token.js'
import { sendWebhook } from '../chat/webhook.js'
import type { VigilConfig } from '../config.js'
import type { DB } from '../db/client.js'
import type { TaskProvider } from '../providers/provider.js'
import { log } from '../util/logger.js'

export function createMcpServer(config: VigilConfig, db: DB, provider: TaskProvider) {
	const server = new McpServer({
		name: 'vigil',
		version: '0.1.0',
	})

	server.tool(
		'vigil_create_chat',
		'Create a clarification chat session for a vague task. Returns a chat URL to share with the requester.',
		{
			taskId: z.string().describe('The Vigil task ID to create a chat for'),
			taskTitle: z.string().describe('The task title for context'),
			taskDescription: z.string().optional().describe('The task description if available'),
		},
		async ({ taskId, taskTitle, taskDescription }) => {
			if (!config.chat?.enabled) {
				return { content: [{ type: 'text', text: 'Chat is not enabled in Vigil config.' }], isError: true }
			}

			const token = signToken(randomUUID(), config.chat.secret, config.chat.expiryDays)
			const session = db.createChatSession(taskId, token)
			const baseUrl = config.chat.baseUrl ?? `http://localhost:${config.server.port}`
			const chatUrl = `${baseUrl}/chat/${token}`

			log.info('mcp', `Created chat session ${session.id} for task ${taskId}`)

			// Post chat link as a comment on the source task
			const task = db.getTask(taskId)
			if (task) {
				const comment = `I need more details about this task before I can solve it.\n\n[Click here to chat](${chatUrl})`
				try {
					await provider.postComment(task.clientcareId, comment)
					log.success('mcp', `Posted chat link as comment on task ${task.clientcareId}`)
				} catch (err) {
					log.warn('mcp', `Failed to post comment: ${err instanceof Error ? err.message : err}`)
				}
			}

			if (config.chat.webhook) {
				await sendWebhook(config.chat.webhook, {
					event: 'clarification_needed',
					taskId,
					taskTitle,
					taskDescription,
					chatUrl,
					message: `I need more details about this task. Please click the link to chat: ${chatUrl}`,
				})
			}

			return {
				content: [{ type: 'text', text: JSON.stringify({ sessionId: session.id, chatUrl }) }],
			}
		},
	)

	server.tool(
		'vigil_send_message',
		'Send a message in a chat session and wait for the requester to respond. This call blocks until the requester replies.',
		{
			sessionId: z.string().describe('The chat session ID'),
			message: z.string().describe('The message to send to the requester'),
		},
		async ({ sessionId, message }) => {
			const session = db.getChatSession(sessionId)
			if (!session || session.status !== 'active') {
				return { content: [{ type: 'text', text: 'Chat session not found or not active.' }], isError: true }
			}

			const msgId = db.addChatMessage(sessionId, 'assistant', message)
			emitSessionEvent(sessionId)
			log.info('mcp', `Chat ${sessionId}: sent message, waiting for response...`)

			const maxWait = 24 * 60 * 60 * 1000
			const start = Date.now()

			while (Date.now() - start < maxWait) {
				await waitForSessionEvent(sessionId)

				const newMessages = db.getNewUserMessages(sessionId, msgId)
				if (newMessages.length > 0) {
					const response = newMessages.map(m => m.content).join('\n')
					log.info('mcp', `Chat ${sessionId}: received response`)
					return { content: [{ type: 'text', text: `Requester responded: ${response}` }] }
				}

				const currentSession = db.getChatSession(sessionId)
				if (!currentSession || currentSession.status !== 'active') {
					return {
						content: [{ type: 'text', text: 'Chat session was closed before a response was received.' }],
					}
				}
			}

			return { content: [{ type: 'text', text: 'Timed out waiting for requester response.' }], isError: true }
		},
	)

	server.tool(
		'vigil_end_chat',
		'End a chat session and get the full conversation transcript.',
		{
			sessionId: z.string().describe('The chat session ID to end'),
		},
		async ({ sessionId }) => {
			const session = db.getChatSession(sessionId)
			if (!session) {
				return { content: [{ type: 'text', text: 'Chat session not found.' }], isError: true }
			}

			db.completeChatSession(sessionId)
			emitSessionEvent(sessionId)

			const messages = db.getChatMessages(sessionId)
			const transcript = formatTranscript(messages)

			log.info('mcp', `Chat ${sessionId}: ended with ${messages.length} messages`)

			return {
				content: [{ type: 'text', text: `Chat session ended. Transcript:\n\n${transcript}` }],
			}
		},
	)

	return server
}

const TRANSPORT_TTL_MS = 30 * 60 * 1000 // 30 minutes
const transports = new Map<string, { transport: WebStandardStreamableHTTPServerTransport; createdAt: number }>()

function createTransport(): WebStandardStreamableHTTPServerTransport {
	const transport = new WebStandardStreamableHTTPServerTransport({
		sessionIdGenerator: () => randomUUID(),
		onsessioninitialized: id => {
			transports.set(id, { transport, createdAt: Date.now() })
		},
	})
	return transport
}

// Periodic cleanup of stale transports
setInterval(
	() => {
		const now = Date.now()
		for (const [id, entry] of transports) {
			if (now - entry.createdAt > TRANSPORT_TTL_MS) {
				entry.transport.close()
				transports.delete(id)
			}
		}
	},
	5 * 60 * 1000,
)

export async function handleMcpRequest(server: McpServer, req: Request): Promise<Response> {
	const sessionId = req.headers.get('mcp-session-id')

	if (sessionId) {
		const entry = transports.get(sessionId)
		if (entry) {
			if (req.method === 'DELETE') {
				const response = await entry.transport.handleRequest(req)
				transports.delete(sessionId)
				return response
			}
			entry.createdAt = Date.now() // refresh TTL on activity
			return entry.transport.handleRequest(req)
		}
	}

	if (req.method === 'POST' || req.method === 'GET') {
		const transport = createTransport()
		await server.connect(transport)
		return transport.handleRequest(req)
	}

	return new Response('Session not found', { status: 404 })
}
