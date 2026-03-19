import { Command } from "commander"
import { SolverClient } from "@payload-exchange/solver-sdk"
import { readFileSync } from "node:fs"
import { log, output } from "../lib/output.js"
import { resolveWallet } from "../lib/wallet.js"

export const fulfillCommand = new Command("fulfill")
	.description("Submit a fulfillment result for a matched order")
	.requiredOption("--order <id>", "Order ID")
	.option("--result <json>", "Result as JSON string")
	.option("--result-file <path>", "Path to file containing result JSON")
	.option("--result-stdin", "Read result JSON from stdin")
	.option("--proof <json>", "Proof data as JSON string")
	.option("--proof-file <path>", "Path to file containing proof JSON")
	.option("--execution-time <str>", "Execution time (e.g. '150ms')")
	.option("--seller <address>", "Override seller address")
	.action(async (_opts, cmd) => {
		const opts = _opts as Record<string, string | boolean | undefined>
		const parent = cmd.parent?.opts() as { coordinator: string; key?: string; json?: boolean }

		const { address } = resolveWallet(parent.key, "solver")
		const sellerAddress = (opts.seller as string) ?? address

		// Read result from one of three sources
		let resultData: unknown
		if (opts.resultStdin) {
			const chunks: Buffer[] = []
			for await (const chunk of process.stdin) {
				chunks.push(chunk as Buffer)
			}
			resultData = JSON.parse(Buffer.concat(chunks).toString("utf-8"))
		} else if (opts.resultFile) {
			resultData = JSON.parse(readFileSync(opts.resultFile as string, "utf-8"))
		} else if (opts.result) {
			resultData = JSON.parse(opts.result as string)
		} else {
			log("[solver] Error: provide --result, --result-file, or --result-stdin")
			process.exit(1)
		}

		// Read optional proof
		let proof: Record<string, unknown> | undefined
		if (opts.proofFile) {
			proof = JSON.parse(readFileSync(opts.proofFile as string, "utf-8"))
		} else if (opts.proof) {
			proof = JSON.parse(opts.proof as string)
		}

		const client = new SolverClient(parent.coordinator)

		log(`[solver] Submitting fulfillment for order ${opts.order}...`)

		try {
			const response = await client.submitFulfillment({
				orderId: opts.order as string,
				sellerId: sellerAddress,
				result: resultData,
				proof,
				executionTime: opts.executionTime as string | undefined,
			})

			if (response.attestation.success) {
				const checks = response.attestation.checks ?? []
				const passed = checks.filter((c) => c.passed).length
				log(`[solver] Attestation: PASSED (${passed}/${checks.length} checks)`)
			} else {
				log(`[solver] Attestation: FAILED — ${response.attestation.reason ?? "unknown"}`)
			}
			log(`[solver] Next step: ${response.nextStep}`)

			output(response, !!parent.json)
		} catch (err) {
			log(`[solver] Failed: ${(err as Error).message}`)
			process.exit(1)
		}
	})
