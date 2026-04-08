import { createHmac, timingSafeEqual } from 'node:crypto'

export interface TokenPayload {
	sessionId: string
	expiresAt: number
}

export function signToken(sessionId: string, secret: string, expiryDays: number): string {
	const expiresAt = Date.now() + expiryDays * 24 * 60 * 60 * 1000
	const data = `${sessionId}:${expiresAt}`
	const signature = createHmac('sha256', secret).update(data).digest('hex')
	return Buffer.from(`${data}:${signature}`).toString('base64url')
}

export function verifyToken(token: string, secret: string): TokenPayload | null {
	try {
		const decoded = Buffer.from(token, 'base64url').toString()
		const parts = decoded.split(':')
		if (parts.length !== 3) return null

		const [sessionId, expiresAtStr, signature] = parts
		const data = `${sessionId}:${expiresAtStr}`
		const expected = createHmac('sha256', secret).update(data).digest('hex')

		const sigBuffer = Buffer.from(signature, 'hex')
		const expectedBuffer = Buffer.from(expected, 'hex')
		if (sigBuffer.length !== expectedBuffer.length || !timingSafeEqual(sigBuffer, expectedBuffer)) {
			return null
		}

		const expiresAt = Number(expiresAtStr)
		if (Number.isNaN(expiresAt) || Date.now() > expiresAt) {
			return null
		}

		return { sessionId, expiresAt }
	} catch {
		return null
	}
}
