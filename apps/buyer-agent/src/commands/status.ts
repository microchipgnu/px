import { Command } from "commander"
import { BuyerClient } from "@payload-exchange/buyer-sdk"
import { log, output } from "../lib/output.js"

export const statusCommand = new Command("status")
	.description("Get the current status of an order")
	.requiredOption("--order <id>", "Order ID")
	.action(async (_opts, cmd) => {
		const opts = _opts as { order: string }
		const parent = cmd.parent?.opts() as { coordinator: string; json?: boolean }

		const client = new BuyerClient(parent.coordinator)

		try {
			const result = await client.getStatus(opts.order)
			log(`[buyer] Order ${opts.order}: ${result.status}`)
			output(result, !!parent.json)
		} catch (err) {
			log(`[buyer] Failed: ${(err as Error).message}`)
			process.exit(1)
		}
	})
