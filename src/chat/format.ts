import type { ChatMessage } from '../types.js'

export function formatTranscript(messages: ChatMessage[]): string {
	return messages.map(m => `**${m.role === 'assistant' ? 'Vigil' : 'Requester'}:** ${m.content}`).join('\n\n')
}
