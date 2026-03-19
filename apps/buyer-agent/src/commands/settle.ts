import { Command } from "commander"
import { BuyerClient } from "@payload-exchange/buyer-sdk"
import { log, output } from "../lib/output.js"
import { resolveWallet, tempoRequest } from "../lib/wallet.js"

export const settleCommand = new Command("settle")
	.description("Pay for an attested result via Tempo wallet")
	.requiredOption("--order <id>", "Order ID")
	.action(async (_opts, cmd) => {
		const opts = _opts as { order: string }
		const parent = cmd.parent?.opts() as { coordinator: string; address?: string; json?: boolean }

		const { tempoCli } = resolveWallet(parent.address, "buyer")
		const resultUrl = `${parent.coordinator.replace(/\/+$/, "")}/api/orders/${opts.order}/result`

		log(`[buyer] Settling order ${opts.order} via Tempo wallet...`)

		try {
			const raw = tempoRequest(tempoCli, resultUrl)
			const result = JSON.parse(raw)

			const settlement = result.settlement as Record<string, unknown> | undefined
			if (settlement?.txHash) {
				log(`[buyer] Tx: ${settlement.txHash}`)
			}

			log("[buyer] Settled!")
			output(result, !!parent.json)
		} catch (err) {
			log(`[buyer] Settlement failed: ${(err as Error).message}`)
			process.exit(1)
		}
	})
