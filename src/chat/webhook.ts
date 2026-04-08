import { log } from '../util/logger.js'

interface WebhookConfig {
	url: string
	headers?: Record<string, string>
}

interface WebhookPayload {
	event: string
	taskId: string
	taskTitle: string
	taskDescription?: string
	chatUrl: string
	message: string
}

export async function sendWebhook(config: WebhookConfig, payload: WebhookPayload): Promise<void> {
	try {
		const res = await fetch(config.url, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				...config.headers,
			},
			body: JSON.stringify(payload),
		})

		if (res.ok) {
			log.success('webhook', `Sent ${payload.event} webhook to ${config.url}`)
		} else {
			log.warn('webhook', `Webhook returned ${res.status}: ${await res.text().catch(() => '')}`)
		}
	} catch (err) {
		log.error('webhook', `Failed to send webhook to ${config.url}`, err)
	}
}
