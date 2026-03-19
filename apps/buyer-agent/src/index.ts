#!/usr/bin/env node
import { Command } from "commander"
import { submitCommand } from "./commands/submit.js"
import { statusCommand } from "./commands/status.js"
import { waitCommand } from "./commands/wait.js"
import { resultCommand } from "./commands/result.js"
import { settleCommand } from "./commands/settle.js"
import { runCommand } from "./commands/run.js"

const program = new Command()
	.name("px-buyer")
	.description("payload.exchange buyer CLI — submit intents, check status, settle payments")
	.version("0.0.3")
	.option("--coordinator <url>", "Coordinator URL", process.env.COORDINATOR_URL ?? "https://px-test.fly.dev")
	.option("--address <addr>", "Override wallet address (default: from Tempo wallet)")
	.option("--json", "Output raw JSON (stdout stays clean for piping)")

program.addCommand(submitCommand)
program.addCommand(statusCommand)
program.addCommand(waitCommand)
program.addCommand(resultCommand)
program.addCommand(settleCommand)
program.addCommand(runCommand)

program.parse()
