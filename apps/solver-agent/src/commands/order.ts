import { Command } from "commander"
import { SolverClient } from "@payload-exchange/solver-sdk"
import { log, output } from "../lib/output.js"

export const orderCommand = new Command("order")
	.description("Inspect an order's details (constraints, status, etc.)")
	.requiredOption("--order <id>", "Order ID")
	.action(async (_opts, cmd) => {
		const opts = _opts as { order: string }
		const parent = cmd.parent?.opts() as { coordinator: string; json?: boolean }

		const client = new SolverClient(parent.coordinator)

		try {
			const result = await client.getOrder(opts.order)
			output(result, !!parent.json)
		} catch (err) {
			log(`[solver] Failed: ${(err as Error).message}`)
			process.exit(1)
		}
	})
