import { Command } from "commander"
import { BuyerClient } from "@payload-exchange/buyer-sdk"
import { log, output } from "../lib/output.js"

export const resultCommand = new Command("result")
	.description("Get the fulfillment result for an order (shows 402 if payment needed)")
	.requiredOption("--order <id>", "Order ID")
	.action(async (_opts, cmd) => {
		const opts = _opts as { order: string }
		const parent = cmd.parent?.opts() as { coordinator: string; json?: boolean }

		const client = new BuyerClient(parent.coordinator)

		try {
			const res = await client.getResult(opts.order)

			if (res.status === 402) {
				const challenge = await res.json()
				const amount = challenge?.offers?.[0]?.amount ?? "unknown"
				log(`[buyer] 402 Payment Required — $${amount} via Tempo`)
				log(`[buyer] Use "px-buyer settle --order ${opts.order}" to pay and receive result`)
				output(challenge, !!parent.json)
				process.exit(2) // distinct exit code for "needs payment"
			} else if (res.ok) {
				const data = await res.json()
				log("[buyer] Result received")
				output(data, !!parent.json)
			} else {
				const body = await res.json().catch(() => ({}))
				log(`[buyer] Unexpected response (${res.status})`)
				output(body, !!parent.json)
				process.exit(1)
			}
		} catch (err) {
			log(`[buyer] Failed: ${(err as Error).message}`)
			process.exit(1)
		}
	})
