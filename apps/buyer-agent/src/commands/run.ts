import { Command } from "commander"
import { BuyerClient, createIntent } from "@payload-exchange/buyer-sdk"
import type { TaskClass } from "@payload-exchange/protocol"
import { readFileSync } from "node:fs"
import { log, output } from "../lib/output.js"
import { resolveWallet, tempoRequest } from "../lib/wallet.js"

export const runCommand = new Command("run")
	.description("Full lifecycle: submit → wait for match → wait for attestation → settle via Tempo")
	.requiredOption("--task <class>", "Task class")
	.requiredOption("--intent <text>", "Intent description")
	.requiredOption("--max-price <n>", "Maximum price in USDC")
	.option("--constraints <json>", "Constraints as JSON string")
	.option("--constraints-file <path>", "Path to JSON file with constraints")
	.option("--proof-requirements <csv>", "Comma-separated proof requirements")
	.option("--expires-in <seconds>", "Seconds until expiry", "3600")
	.option("--buyer <address>", "Override buyer address")
	.option("--wait-timeout <ms>", "Timeout for match/attestation wait", "30000")
	.option("--no-settle", "Stop after attestation, do not auto-settle")
	.action(async (_opts, cmd) => {
		const opts = _opts as Record<string, string | boolean | undefined>
		const parent = cmd.parent?.opts() as { coordinator: string; address?: string; json?: boolean }

		const { address, tempoCli } = resolveWallet(parent.address, "buyer")
		const buyerAddress = (opts.buyer as string) ?? address
		const json = !!parent.json

		let constraints: Record<string, unknown> | undefined
		if (opts.constraintsFile) {
			constraints = JSON.parse(readFileSync(opts.constraintsFile as string, "utf-8"))
		} else if (opts.constraints) {
			constraints = JSON.parse(opts.constraints as string)
		}

		const proofRequirements = opts.proofRequirements
			? (opts.proofRequirements as string).split(",").map((s) => s.trim())
			: undefined

		const client = new BuyerClient(parent.coordinator)

		log(`[buyer] Coordinator: ${parent.coordinator}`)
		log(`[buyer] Wallet: ${buyerAddress}`)

		// 1. Submit
		const intent = createIntent({
			buyer: buyerAddress,
			taskClass: opts.task as TaskClass,
			intent: opts.intent as string,
			constraints,
			maxPrice: Number.parseFloat(opts.maxPrice as string),
			expiresIn: Number.parseInt(opts.expiresIn as string, 10),
			proofRequirements,
		})

		let order: { id: string; status: string }
		try {
			order = await client.submitIntent(intent)
			log(`[buyer] Order created: ${order.id} (status: ${order.status})`)
		} catch (err) {
			log(`[buyer] Failed to submit: ${(err as Error).message}`)
			process.exit(1)
		}

		// 2. Wait for match
		const waitTimeout = Number.parseInt(opts.waitTimeout as string, 10)
		log("[buyer] Waiting for match...")
		try {
			await client.waitForStatus(order.id, "matched", { timeout: waitTimeout, interval: 1_000 })
			log("[buyer] Matched!")
		} catch (err) {
			log(`[buyer] Match wait failed: ${(err as Error).message}`)
			process.exit(1)
		}

		// 3. Wait for attestation
		log("[buyer] Waiting for attestation...")
		try {
			await client.waitForStatus(order.id, "attested", { timeout: 60_000, interval: 1_000 })
			log("[buyer] Attested!")
		} catch (err) {
			log(`[buyer] Attestation wait failed: ${(err as Error).message}`)
			process.exit(1)
		}

		// 4. Result / settle
		if (opts.settle === false) {
			log("[buyer] --no-settle: stopping after attestation")
			const status = await client.getStatus(order.id)
			output(status, json)
			return
		}

		const rawRes = await client.getResult(order.id)

		if (rawRes.status === 402) {
			log("[buyer] Paying via Tempo wallet...")
			try {
				const resultUrl = `${parent.coordinator.replace(/\/+$/, "")}/api/orders/${order.id}/result`
				const raw = tempoRequest(tempoCli, resultUrl)
				const result = JSON.parse(raw)

				const settlement = result.settlement as Record<string, unknown> | undefined
				if (settlement?.txHash) {
					log(`[buyer] Tx: ${settlement.txHash}`)
				}

				log("[buyer] Settled!")
				output(result, json)
			} catch (err) {
				log(`[buyer] Settlement failed: ${(err as Error).message}`)
				process.exit(1)
			}
		} else if (rawRes.ok) {
			const result = await rawRes.json()
			log("[buyer] Result received (already settled)")
			output(result, json)
		} else {
			const body = await rawRes.json().catch(() => ({}))
			log(`[buyer] Unexpected response (${rawRes.status})`)
			output(body, json)
			process.exit(1)
		}
	})
