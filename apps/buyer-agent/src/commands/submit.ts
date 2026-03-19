import { Command } from "commander"
import { BuyerClient, createIntent } from "@payload-exchange/buyer-sdk"
import type { TaskClass } from "@payload-exchange/protocol"
import { readFileSync } from "node:fs"
import { log, output } from "../lib/output.js"
import { resolveWallet } from "../lib/wallet.js"

export const submitCommand = new Command("submit")
	.description("Submit an intent (buy order) to the coordinator")
	.requiredOption("--task <class>", "Task class (price_feed, search, computation, etc.)")
	.requiredOption("--intent <text>", "Intent description")
	.requiredOption("--max-price <n>", "Maximum price in USDC")
	.option("--constraints <json>", "Constraints as JSON string")
	.option("--constraints-file <path>", "Path to JSON file with constraints")
	.option("--proof-requirements <csv>", "Comma-separated proof requirements")
	.option("--expires-in <seconds>", "Seconds until expiry", "3600")
	.option("--buyer <address>", "Override buyer address (default: derived from --key)")
	.action(async (_opts, cmd) => {
		const opts = _opts as Record<string, string | undefined>
		const parent = cmd.parent?.opts() as { coordinator: string; key?: string; json?: boolean }

		const { address } = resolveWallet(parent.key, "buyer")
		const buyerAddress = opts.buyer ?? address

		let constraints: Record<string, unknown> | undefined
		if (opts.constraintsFile) {
			constraints = JSON.parse(readFileSync(opts.constraintsFile, "utf-8"))
		} else if (opts.constraints) {
			constraints = JSON.parse(opts.constraints)
		}

		const proofRequirements = opts.proofRequirements
			? (opts.proofRequirements as string).split(",").map((s) => s.trim())
			: undefined

		const client = new BuyerClient(parent.coordinator)

		const intent = createIntent({
			buyer: buyerAddress,
			taskClass: opts.task as TaskClass,
			intent: opts.intent as string,
			constraints,
			maxPrice: Number.parseFloat(opts.maxPrice as string),
			expiresIn: Number.parseInt(opts.expiresIn as string, 10),
			proofRequirements,
		})

		log(`[buyer] Coordinator: ${parent.coordinator}`)
		log(`[buyer] Buyer: ${buyerAddress}`)
		log(`[buyer] Submitting: ${opts.intent}`)

		try {
			const order = await client.submitIntent(intent)
			log(`[buyer] Order submitted: ${order.id} (status: ${order.status})`)
			output(order, !!parent.json)
		} catch (err) {
			log(`[buyer] Failed: ${(err as Error).message}`)
			process.exit(1)
		}
	})
