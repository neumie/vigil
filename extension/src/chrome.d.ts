declare const chrome: {
	storage: {
		sync: {
			get<T extends Record<string, unknown>>(defaults: T, callback: (items: T) => void): void
			set(items: Record<string, unknown>, callback?: () => void): void
		}
	}
}
