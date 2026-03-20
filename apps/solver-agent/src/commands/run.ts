import { Command } from "commander"
import { SolverClient } from "@payload-exchange/solver-sdk"
import type { TaskClass, PricingModel } from "@payload-exchange/protocol"
import { readFileSync } from "node:fs"
import { log, output } from "../lib/output.js"
import { execHandler } from "../lib/exec.js"
import { resolveWallet } from "../lib/wallet.js"

export const runCommand = new Command("run")
	.description("Full lifecycle: register → listen → auto-fulfill via --exec")
	.requiredOption("--tasks <csv>", "Comma-separated task classes")
	.requiredOption("--price <n>", "Fee per task in USDC")
	.requiredOption("--exec <command>", "Shell command to run on match (receives match JSON on stdin)")
	.option("--pricing-model <model>", "Pricing model", "fixed")
	.option("--stake <n>", "Stake amount", "0")
	.option("--execution-terms <json>", "Execution terms as JSON string")
	.option("--execution-terms-file <path>", "Path to JSON file with execution terms")
	.option("--exec-timeout <ms>", "Timeout for --exec command", "30000")
	.option("--seller <address>", "Override seller address")
	.action(async (_opts, cmd) => {
		const opts = _opts as Record<string, string | undefined>
		const parent = cmd.parent?.opts() as { coordinator: string; address?: string; json?: boolean }

		const { address } = resolveWallet(parent.address, "solver")
		const sellerAddress = opts.seller ?? address
		const json = !!parent.json
		const taskClasses = (opts.tasks as string).split(",").map((s) => s.trim()) as TaskClass[]

		let executionTerms: Record<string, unknown> | undefined
		if (opts.executionTermsFile) {
			executionTerms = JSON.parse(readFileSync(opts.executionTermsFile, "utf-8"))
		} else if (opts.executionTerms) {
			executionTerms = JSON.parse(opts.executionTerms)
		}

		const client = new SolverClient(parent.coordinator)
		const registerParams = {
			seller: sellerAddress,
			supportedTaskClasses: taskClasses,
			pricingModel: (opts.pricingModel ?? "fixed") as PricingModel,
			price: Number.parseFloat(opts.price as string),
			stake: Number.parseFloat(opts.stake ?? "0"),
			executionTerms,
		}

		// 1. Register
		log(`[solver] Coordinator: ${parent.coordinator}`)
		log(`[solver] Wallet: ${sellerAddress}`)
		log(`[solver] Registering for: ${taskClasses.join(", ")}`)

		try {
			const reg = await client.register(registerParams)
			log(`[solver] Registered: ${reg.id}`)
		} catch (err) {
			log(`[solver] Registration failed: ${(err as Error).message}`)
			process.exit(1)
		}

		// 2. Listen + auto-fulfill
		log("[solver] Listening for matches...")

		const connection = client.connect({ taskClasses })

		process.on("SIGINT", () => {
			log("\n[solver] Shutting down...")
			connection.close()
			process.exit(0)
		})

		process.on("SIGTERM", () => {
			connection.close()
			process.exit(0)
		})

		const execTimeout = Number.parseInt(opts.execTimeout ?? "30000", 10)

		for await (const event of connection.events) {
			if (event.event === "subscribed") {
				log(`[solver] Subscribed to ${taskClasses.join(", ")}`)
				continue
			}

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

				log(`[solver] Match: ${data.orderId} — ${data.intent} ($${data.agreedPrice})`)
				log(`[solver] Running: ${opts.exec}`)

				try {
					const resultStr = await execHandler(opts.exec as string, JSON.stringify(data), execTimeout)

					let resultData: unknown
					let proofData: Record<string, unknown> | undefined
					try {
						const parsed = JSON.parse(resultStr)
						// If exec output has { result, proof }, extract both
						if (parsed && typeof parsed === "object" && "result" in parsed) {
							resultData = parsed.result
							proofData = parsed.proof as Record<string, unknown> | undefined
						} else {
							resultData = parsed
						}
					} catch {
						resultData = resultStr
					}

					const response = await client.submitFulfillment({
						orderId: data.orderId,
						sellerId: sellerAddress,
						result: resultData,
						proof: proofData,
					})

					if (response.attestation.success) {
						const checks = response.attestation.checks ?? []
						log(`[solver] Attestation: PASSED (${checks.filter((c) => c.passed).length}/${checks.length})`)
					} else {
						log(`[solver] Attestation: FAILED — ${response.attestation.reason ?? "unknown"}`)
					}

					output(response, json)
				} catch (err) {
					log(`[solver] Exec/fulfill failed: ${(err as Error).message}`)
				}

				// Re-register so we can serve the next buyer
				try {
					const reg = await client.register(registerParams)
					log(`[solver] Re-registered: ${reg.id}`)
				} catch (err) {
					log(`[solver] Re-registration failed: ${(err as Error).message}`)
				}

				continue
			}

			if (event.event === "settlement_complete") {
				const data = event.data as { orderId: string; sellerReceived: number; txHash?: string }
				log(`[solver] Paid! $${data.sellerReceived}${data.txHash ? ` (tx: ${data.txHash})` : ""}`)
			}

			// Stream all events when --json
			if (json) {
				output(event, true)
			}
		}

		log("[solver] Connection closed.")
	})
