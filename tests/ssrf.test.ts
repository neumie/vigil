import assert from 'node:assert/strict'
import test from 'node:test'
import { isSafePublicHttpUrl } from '../src/util/ssrf.js'

test('isSafePublicHttpUrl blocks loopback / private / link-local / metadata literals', async () => {
	const blocked = [
		'http://127.0.0.1/x',
		'http://127.5.5.5/x',
		'http://localhost:7474/api',
		'http://0.0.0.0/x',
		'http://10.0.0.5/x',
		'http://172.16.4.4/x',
		'http://172.31.255.1/x',
		'http://192.168.1.10/x',
		'http://169.254.169.254/latest/meta-data/', // cloud metadata
		'http://100.64.0.1/x', // CGNAT
		'http://[::1]/x', // IPv6 loopback
		'http://[fc00::1]/x', // IPv6 ULA
		'http://[fe80::1]/x', // IPv6 link-local
		'http://[::ffff:127.0.0.1]/x', // IPv4-mapped loopback
	]
	for (const url of blocked) {
		assert.equal(await isSafePublicHttpUrl(url), false, `should block ${url}`)
	}
})

test('isSafePublicHttpUrl blocks non-http(s) schemes', async () => {
	for (const url of ['file:///etc/passwd', 'ftp://8.8.8.8/x', 'gopher://8.8.8.8/x', 'data:text/plain,hi']) {
		assert.equal(await isSafePublicHttpUrl(url), false, `should block ${url}`)
	}
})

test('isSafePublicHttpUrl allows a public IP literal', async () => {
	assert.equal(await isSafePublicHttpUrl('https://8.8.8.8/image.png'), true)
	assert.equal(await isSafePublicHttpUrl('http://1.1.1.1/x'), true)
})

test('isSafePublicHttpUrl rejects garbage', async () => {
	assert.equal(await isSafePublicHttpUrl('not a url'), false)
	assert.equal(await isSafePublicHttpUrl(''), false)
})
