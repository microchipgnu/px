import { Command } from "commander"
import { SolverClient } from "@payload-exchange/solver-sdk"
import { log, output } from "../lib/output.js"
import { execHandler } from "../lib/exec.js"
import { resolveWallet } from "../lib/wallet.js"

export const listenCommand = new Command("listen")
	.description("Connect via WebSocket and stream events (pipeable)")
	.option("--tasks <csv>", "Comma-separated task classes to subscribe to")
	.option("--exec <command>", "Shell command to run on match (receives match JSON on stdin, stdout = result)")
	.option("--exec-timeout <ms>", "Timeout for --exec command", "30000")
	.option("--auto-fulfill", "Automatically submit --exec output as fulfillment")
	.option("--seller <address>", "Override seller address")
	.action(async (_opts, cmd) => {
		const opts = _opts as Record<string, string | boolean | undefined>
		const parent = cmd.parent?.opts() as { coordinator: string; key?: string; json?: boolean }

		const { address } = resolveWallet(parent.key, "solver")
		const sellerAddress = (opts.seller as string) ?? address
		const json = !!parent.json
		const taskClasses = opts.tasks ? (opts.tasks as string).split(",").map((s) => s.trim()) : undefined

		const client = new SolverClient(parent.coordinator)

		log(`[solver] Connecting to ${parent.coordinator}...`)

		let connection: ReturnType<typeof client.connect>
		try {
			connection = client.connect({ taskClasses })
		} catch (err) {
			log(`[solver] WebSocket connection failed: ${(err as Error).message}`)
			process.exit(1)
		}

		process.on("SIGINT", () => {
			log("\n[solver] Shutting down...")
			connection.close()
			process.exit(0)
		})

		process.on("SIGTERM", () => {
			connection.close()
			process.exit(0)
		})

		for await (const event of connection.events) {
			// Always output events
			output({ event: event.event, data: event.data, timestamp: event.timestamp }, json)

			// On match assigned to us, optionally exec
			if (event.event === "order_matched") {
				const data = event.data as {
					orderId: string
					buyer: string
					seller: string
					taskClass: string
					intent: string
					agreedPrice: number
				}

				if (data.seller !== sellerAddress) continue

				log(`[solver] Matched! Order: ${data.orderId} — ${data.intent} ($${data.agreedPrice})`)

				if (opts.exec) {
					const execTimeout = Number.parseInt(opts.execTimeout as string, 10)
					log(`[solver] Running: ${opts.exec}`)

					try {
						const resultStr = await execHandler(
							opts.exec as string,
							JSON.stringify(data),
							execTimeout,
						)

						let resultData: unknown
						try {
							resultData = JSON.parse(resultStr)
						} catch {
							resultData = resultStr
						}

						if (opts.autoFulfill) {
							log("[solver] Auto-fulfilling...")
							const response = await client.submitFulfillment({
								orderId: data.orderId,
								sellerId: sellerAddress,
								result: resultData,
							})

							if (response.attestation.success) {
								log(`[solver] Attestation: PASSED`)
							} else {
								log(`[solver] Attestation: FAILED — ${response.attestation.reason ?? "unknown"}`)
							}
							output(response, json)
						} else {
							log(`[solver] Exec result (use "px-solver fulfill" to submit):`)
							output({ orderId: data.orderId, result: resultData }, json)
						}
					} catch (err) {
						log(`[solver] Exec failed: ${(err as Error).message}`)
					}
				}
			}
		}

		log("[solver] Connection closed.")
	})
