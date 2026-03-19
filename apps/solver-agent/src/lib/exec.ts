import { spawn } from "node:child_process"

/**
 * Spawn a shell command, pipe `input` to stdin, capture stdout.
 * Returns the stdout string. Rejects on non-zero exit or timeout.
 */
export function execHandler(command: string, input: string, timeout: number): Promise<string> {
	return new Promise((resolve, reject) => {
		const child = spawn("sh", ["-c", command], {
			stdio: ["pipe", "pipe", "pipe"],
		})

		let stdout = ""
		let stderr = ""

		child.stdout.on("data", (chunk: Buffer) => {
			stdout += chunk.toString()
		})

		child.stderr.on("data", (chunk: Buffer) => {
			stderr += chunk.toString()
		})

		const timer = setTimeout(() => {
			child.kill("SIGTERM")
			reject(new Error(`exec timed out after ${timeout}ms`))
		}, timeout)

		child.on("close", (code) => {
			clearTimeout(timer)
			if (code === 0) {
				resolve(stdout.trim())
			} else {
				reject(new Error(`exec exited with code ${code}: ${stderr.trim()}`))
			}
		})

		child.on("error", (err) => {
			clearTimeout(timer)
			reject(err)
		})

		child.stdin.write(input)
		child.stdin.end()
	})
}
