import { lookup } from 'node:dns/promises'
import { isIP } from 'node:net'

/**
 * SSRF guard for server-side fetches of ATTACKER-INFLUENCED URLs (e.g. image
 * attachments on an untrusted task). Rejects any URL whose host is — or resolves
 * to — a private, loopback, link-local, or otherwise-reserved address, so a
 * crafted task can't make the daemon reach cloud metadata (169.254.169.254),
 * localhost, or the private LAN. Pair with `redirect: 'manual'` and re-validate
 * every hop (a redirect can point back at an internal address).
 *
 * Residual: DNS rebinding (host resolves safe here, then the fetch re-resolves to
 * an internal IP) is not fully closed — pinning the resolved IP would break TLS
 * SNI/cert validation for https. The range check + per-hop revalidation closes
 * the practical hole.
 */

function ipv4ToInt(ip: string): number | null {
	const parts = ip.split('.')
	if (parts.length !== 4) return null
	let n = 0
	for (const p of parts) {
		if (!/^\d{1,3}$/.test(p)) return null
		const octet = Number(p)
		if (octet > 255) return null
		n = n * 256 + octet
	}
	return n
}

// Private / loopback / link-local / CGNAT / reserved IPv4 blocks (base, prefix).
const BLOCKED_V4: ReadonlyArray<readonly [string, number]> = [
	['0.0.0.0', 8],
	['10.0.0.0', 8],
	['100.64.0.0', 10],
	['127.0.0.0', 8],
	['169.254.0.0', 16],
	['172.16.0.0', 12],
	['192.0.0.0', 24],
	['192.168.0.0', 16],
	['198.18.0.0', 15],
	['224.0.0.0', 4],
	['240.0.0.0', 4],
]

function blockedV4(ip: string): boolean {
	const n = ipv4ToInt(ip)
	if (n === null) return true // unparseable → fail safe (block)
	for (const [base, prefix] of BLOCKED_V4) {
		const b = ipv4ToInt(base)
		if (b === null) continue
		const shift = 32 - prefix
		if (n >>> shift === b >>> shift) return true
	}
	return false
}

function blockedV6(ip: string): boolean {
	const addr = ip
		.split('%')[0]
		.toLowerCase()
		.replace(/^\[|\]$/g, '')
	if (addr === '::1' || addr === '::') return true // loopback / unspecified
	// IPv4-mapped (::ffff:a.b.c.d) — URL parsing may normalize it to hex (::ffff:7f00:1).
	const mappedDotted = addr.match(/^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/)
	if (mappedDotted) return blockedV4(mappedDotted[1])
	const mappedHex = addr.match(/^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/)
	if (mappedHex) {
		const hi = Number.parseInt(mappedHex[1], 16)
		const lo = Number.parseInt(mappedHex[2], 16)
		return blockedV4(`${(hi >> 8) & 0xff}.${hi & 0xff}.${(lo >> 8) & 0xff}.${lo & 0xff}`)
	}
	const first = addr.split(':')[0]
	if (/^f[cd]/.test(first)) return true // fc00::/7  unique-local
	if (/^fe[89ab]/.test(first)) return true // fe80::/10 link-local
	if (/^ff/.test(first)) return true // ff00::/8  multicast
	return false
}

/**
 * True only when `rawUrl` is an http(s) URL whose host is public. A literal IP is
 * range-checked directly; a hostname is DNS-resolved and EVERY resolved address
 * must be public. Any parse/resolve failure, non-http(s) scheme, or obvious
 * localhost alias returns false (fail safe).
 */
export async function isSafePublicHttpUrl(rawUrl: string): Promise<boolean> {
	let u: URL
	try {
		u = new URL(rawUrl)
	} catch {
		return false
	}
	if (u.protocol !== 'http:' && u.protocol !== 'https:') return false
	const host = u.hostname.replace(/^\[|\]$/g, '')
	const family = isIP(host)
	if (family === 4) return !blockedV4(host)
	if (family === 6) return !blockedV6(host)
	if (!host || /^(localhost|.*\.localhost|.*\.local|.*\.internal)$/i.test(host)) return false
	let addrs: Array<{ address: string; family: number }>
	try {
		addrs = await lookup(host, { all: true })
	} catch {
		return false
	}
	if (addrs.length === 0) return false
	return addrs.every(a => (a.family === 4 ? !blockedV4(a.address) : !blockedV6(a.address)))
}
