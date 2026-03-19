import { Command } from "commander"
import { BuyerClient } from "@payload-exchange/buyer-sdk"
import { log, output } from "../lib/output.js"

export const waitCommand = new Command("wait")
	.description("Wait until an order reaches a target status")
	.requiredOption("--order <id>", "Order ID")
	.requiredOption("--target <status>", "Target status (matched, attested, settled, etc.)")
	.option("--timeout <ms>", "Timeout in milliseconds", "60000")
	.option("--interval <ms>", "Polling interval in milliseconds", "1000")
	.action(async (_opts, cmd) => {
		const opts = _opts as { order: string; target: string; timeout: string; interval: string }
		const parent = cmd.parent?.opts() as { coordinator: string; json?: boolean }

		const client = new BuyerClient(parent.coordinator)

		log(`[buyer] Waiting for order ${opts.order} to reach "${opts.target}"...`)

		try {
			const result = await client.waitForStatus(opts.order, opts.target, {
				timeout: Number.parseInt(opts.timeout, 10),
				interval: Number.parseInt(opts.interval, 10),
			})
			log(`[buyer] Order ${opts.order} reached "${result.status}"`)
			output(result, !!parent.json)
		} catch (err) {
			log(`[buyer] Failed: ${(err as Error).message}`)
			process.exit(1)
		}
	})
