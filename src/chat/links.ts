import { randomUUID } from 'node:crypto'
import type { VigilConfig } from '../config.js'
import type { DB } from '../db/client.js'
import type { ChatSession } from '../types.js'
import { signToken } from './token.js'

/**
 * The single owner of chat-link identity: where a session lives on the wire and
 * how it is addressed.
 *
 * Two invariants are concentrated here so no call site can get them wrong:
 *
 *  1. **Lazy baseUrl.** `config.chat.baseUrl` is mutated at runtime once the
 *     Cloudflare tunnel assigns a URL (see `index.ts` / `tunnel.ts`). Every URL
 *     is built from `config.chat?.baseUrl` read at call time, never captured at
 *     construction — so links built before and after tunnel start each pick up
 *     the right host.
 *  2. **Token, never id.** Public URLs address a session by its signed,
 *     expiring `token`. The DB primary key (`session.id`) is not
 *     signature-verified; leaking it would bypass the gate. `chatUrl` only ever
 *     interpolates a token.
 *
 * One construction site for `signToken(randomUUID(), …)` + `createChatSession`
 * means the token/id discipline lives in exactly one place.
 */
export class ChatLinks {
	constructor(
		private readonly config: VigilConfig,
		private readonly db: DB,
	) {}

	/** The chat base URL, resolved at call time to honor the runtime tunnel mutation. */
	private baseUrl(): string {
		return this.config.chat?.baseUrl ?? `http://localhost:${this.config.server.port}`
	}

	/** Public chat URL for a signed token. Token only — never the session id. */
	urlForToken(token: string): string {
		return `${this.baseUrl()}/chat/${token}`
	}

	/**
	 * Mint a fresh signed token, create the backing session row, and return both
	 * the session and its public URL. The single owner of session creation.
	 */
	createSession(taskId: string): { session: ChatSession; chatUrl: string } {
		const chat = this.config.chat
		if (!chat) throw new Error('ChatLinks.createSession called with chat disabled')
		const token = signToken(randomUUID(), chat.secret, chat.expiryDays)
		const session = this.db.createChatSession(taskId, token)
		return { session, chatUrl: this.urlForToken(token) }
	}
}
