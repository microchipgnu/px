import { Command } from "commander"
import { SolverClient } from "@payload-exchange/solver-sdk"
import type { TaskClass, PricingModel } from "@payload-exchange/protocol"
import { readFileSync } from "node:fs"
import { log, output } from "../lib/output.js"
import { resolveWallet } from "../lib/wallet.js"

export const registerCommand = new Command("register")
	.description("Register solver capabilities (sell order) with the coordinator")
	.requiredOption("--tasks <csv>", "Comma-separated task classes")
	.requiredOption("--price <n>", "Fee per task in USDC")
	.option("--pricing-model <model>", "Pricing model (fixed, percentage, auction, dynamic)", "fixed")
	.option("--stake <n>", "Stake amount", "0")
	.option("--execution-terms <json>", "Execution terms as JSON string")
	.option("--execution-terms-file <path>", "Path to JSON file with execution terms")
	.option("--seller <address>", "Override seller address (default: derived from --key)")
	.action(async (_opts, cmd) => {
		const opts = _opts as Record<string, string | undefined>
		const parent = cmd.parent?.opts() as { coordinator: string; address?: string; json?: boolean }

		const { address } = resolveWallet(parent.address, "solver")
		const sellerAddress = opts.seller ?? address
		const taskClasses = (opts.tasks as string).split(",").map((s) => s.trim()) as TaskClass[]

		let executionTerms: Record<string, unknown> | undefined
		if (opts.executionTermsFile) {
			executionTerms = JSON.parse(readFileSync(opts.executionTermsFile, "utf-8"))
		} else if (opts.executionTerms) {
			executionTerms = JSON.parse(opts.executionTerms)
		}

		const client = new SolverClient(parent.coordinator)

		log(`[solver] Coordinator: ${parent.coordinator}`)
		log(`[solver] Seller: ${sellerAddress}`)
		log(`[solver] Registering for: ${taskClasses.join(", ")}`)

		try {
			const result = await client.register({
				seller: sellerAddress,
				supportedTaskClasses: taskClasses,
				pricingModel: (opts.pricingModel ?? "fixed") as PricingModel,
				price: Number.parseFloat(opts.price as string),
				stake: Number.parseFloat(opts.stake ?? "0"),
				executionTerms,
			})
			log(`[solver] Registered: ${result.id} (status: ${result.status})`)
			output(result, !!parent.json)
		} catch (err) {
			log(`[solver] Failed: ${(err as Error).message}`)
			process.exit(1)
		}
	})
