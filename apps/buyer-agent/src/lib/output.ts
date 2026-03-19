/** Log diagnostic message to stderr (keeps stdout clean for piping) */
export function log(msg: string): void {
	process.stderr.write(`${msg}\n`)
}

/** Write structured result to stdout */
export function output(data: unknown, json: boolean): void {
	if (json) {
		process.stdout.write(`${JSON.stringify(data)}\n`)
	} else {
		process.stdout.write(`${typeof data === "string" ? data : JSON.stringify(data, null, 2)}\n`)
	}
}
