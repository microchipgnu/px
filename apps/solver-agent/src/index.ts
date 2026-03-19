#!/usr/bin/env node
import { Command } from "commander"
import { registerCommand } from "./commands/register.js"
import { orderCommand } from "./commands/order.js"
import { listenCommand } from "./commands/listen.js"
import { fulfillCommand } from "./commands/fulfill.js"
import { runCommand } from "./commands/run.js"

const program = new Command()
	.name("px-solver")
	.description("payload.exchange solver CLI — register, listen for matches, fulfill orders")
	.version("0.0.3")
	.option("--coordinator <url>", "Coordinator URL", process.env.COORDINATOR_URL ?? "https://px-test.fly.dev")
	.option("--address <addr>", "Override wallet address (default: from Tempo wallet)")
	.option("--json", "Output raw JSON (stdout stays clean for piping)")

program.addCommand(registerCommand)
program.addCommand(orderCommand)
program.addCommand(listenCommand)
program.addCommand(fulfillCommand)
program.addCommand(runCommand)

program.parse()
