const colors = {
	reset: '\x1b[0m',
	dim: '\x1b[2m',
	green: '\x1b[32m',
	yellow: '\x1b[33m',
	red: '\x1b[31m',
	cyan: '\x1b[36m',
	magenta: '\x1b[35m',
}

function timestamp(): string {
	return new Date().toISOString().slice(11, 19)
}

export const log = {
	info(tag: string, msg: string, data?: Record<string, unknown>) {
		const extra = data ? ` ${colors.dim}${JSON.stringify(data)}${colors.reset}` : ''
		console.log(`${colors.dim}${timestamp()}${colors.reset} ${colors.cyan}[${tag}]${colors.reset} ${msg}${extra}`)
	},
	success(tag: string, msg: string, data?: Record<string, unknown>) {
		const extra = data ? ` ${colors.dim}${JSON.stringify(data)}${colors.reset}` : ''
		console.log(`${colors.dim}${timestamp()}${colors.reset} ${colors.green}[${tag}]${colors.reset} ${msg}${extra}`)
	},
	warn(tag: string, msg: string, data?: unknown) {
		const extra = data
			? ` ${colors.dim}${data instanceof Error ? data.message : JSON.stringify(data)}${colors.reset}`
			: ''
		console.warn(`${colors.dim}${timestamp()}${colors.reset} ${colors.yellow}[${tag}]${colors.reset} ${msg}${extra}`)
	},
	error(tag: string, msg: string, error?: unknown) {
		const errMsg = error instanceof Error ? error.message : String(error ?? '')
		console.error(
			`${colors.dim}${timestamp()}${colors.reset} ${colors.red}[${tag}]${colors.reset} ${msg}${errMsg ? ` — ${errMsg}` : ''}`,
		)
	},
}
