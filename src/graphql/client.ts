export class GraphQLClient {
	private url: string
	private token: string

	constructor(apiBaseUrl: string, projectSlug: string, token: string) {
		this.url = `${apiBaseUrl}/content/${projectSlug}/live`
		this.token = token
	}

	async query<T = unknown>(query: string, variables?: Record<string, unknown>): Promise<T> {
		const res = await fetch(this.url, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				Authorization: `Bearer ${this.token}`,
			},
			body: JSON.stringify({ query, variables }),
		})

		if (!res.ok) {
			const text = await res.text()
			throw new Error(`GraphQL request failed (${res.status}): ${text}`)
		}

		const json = (await res.json()) as { data?: T; errors?: Array<{ message: string }> }

		if (json.errors?.length) {
			throw new Error(`GraphQL errors: ${json.errors.map(e => e.message).join(', ')}`)
		}

		return json.data as T
	}

	async mutate<T = unknown>(mutation: string, variables?: Record<string, unknown>): Promise<T> {
		return this.query<T>(mutation, variables)
	}
}
