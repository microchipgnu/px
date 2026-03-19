import { Command } from "commander"
import { BuyerClient } from "@payload-exchange/buyer-sdk"
import { log, output } from "../lib/output.js"
import { resolveWallet } from "../lib/wallet.js"

export const settleCommand = new Command("settle")
	.description("Pay for an attested result via MPP on Tempo")
	.requiredOption("--order <id>", "Order ID")
	.action(async (_opts, cmd) => {
		const opts = _opts as { order: string }
		const parent = cmd.parent?.opts() as { coordinator: string; key?: string; json?: boolean }

		if (!parent.key) {
			log("[buyer] Error: --key is required for settlement")
			process.exit(1)
		}

		const { account } = resolveWallet(parent.key, "buyer")
		const client = new BuyerClient(parent.coordinator)

		log(`[buyer] Settling order ${opts.order} via MPP...`)

		try {
			const { Mppx, tempo } = await import("mppx/client")
			const mpp = Mppx.create({
				methods: [tempo({ account })],
				polyfill: false,
			})

			const result = await client.settle(opts.order, mpp.fetch as typeof fetch)
			log("[buyer] Settled! Result received.")

			const data = result as Record<string, unknown>
			const settlement = data.settlement as Record<string, unknown> | undefined
			if (settlement?.txHash) {
				log(`[buyer] Tx: ${settlement.txHash}`)
			}

			output(result, !!parent.json)
		} catch (err) {
			log(`[buyer] Settlement failed: ${(err as Error).message}`)
			process.exit(1)
		}
	})
