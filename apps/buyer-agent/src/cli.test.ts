import { describe, expect, test } from "bun:test"
import { Command } from "commander"

function buildProgram(argv: string[], env: Record<string, string | undefined> = {}) {
	const program = new Command()
		.name("px-buyer")
		.option("--coordinator <url>", "Coordinator URL", env.COORDINATOR_URL ?? "https://px-test.fly.dev")
		.option("--address <addr>", "Override wallet address")
		.option("--json", "Output raw JSON")
		.exitOverride()

	const submit = new Command("submit")
		.requiredOption("--task <class>", "Task class")
		.requiredOption("--intent <text>", "Intent description")
		.requiredOption("--max-price <n>", "Maximum price")
		.option("--constraints <json>", "Constraints JSON")
		.option("--proof-requirements <csv>", "Proof requirements")
		.option("--expires-in <seconds>", "Expiry", "3600")
		.option("--buyer <address>", "Buyer address")
		.exitOverride()

	const status = new Command("status")
		.requiredOption("--order <id>", "Order ID")
		.exitOverride()

	const wait = new Command("wait")
		.requiredOption("--order <id>", "Order ID")
		.requiredOption("--target <status>", "Target status")
		.option("--timeout <ms>", "Timeout", "60000")
		.option("--interval <ms>", "Interval", "1000")
		.exitOverride()

	const settle = new Command("settle")
		.requiredOption("--order <id>", "Order ID")
		.exitOverride()

	program.addCommand(submit)
	program.addCommand(status)
	program.addCommand(wait)
	program.addCommand(settle)

	program.parse(["node", "px-buyer", ...argv])
	return { program, sub: program.commands.find((c) => argv.includes(c.name())) }
}

describe("px-buyer global options", () => {
	test("defaults", () => {
		const { program } = buildProgram(["submit", "--task", "search", "--intent", "test", "--max-price", "1"])
		const opts = program.opts()
		expect(opts.coordinator).toBe("https://px-test.fly.dev")
		expect(opts.address).toBeUndefined()
		expect(opts.json).toBeUndefined()
	})

	test("env var fallback for coordinator", () => {
		const { program } = buildProgram(
			["submit", "--task", "search", "--intent", "test", "--max-price", "1"],
			{ COORDINATOR_URL: "http://env:4000" },
		)
		expect(program.opts().coordinator).toBe("http://env:4000")
	})

	test("CLI flags override env vars", () => {
		const { program } = buildProgram(
			["--coordinator", "http://cli:4000", "submit", "--task", "search", "--intent", "test", "--max-price", "1"],
			{ COORDINATOR_URL: "http://env:4000" },
		)
		expect(program.opts().coordinator).toBe("http://cli:4000")
	})

	test("--json flag", () => {
		const { program } = buildProgram(["--json", "submit", "--task", "search", "--intent", "test", "--max-price", "1"])
		expect(program.opts().json).toBe(true)
	})
})

describe("px-buyer submit", () => {
	test("parses required flags", () => {
		const { sub } = buildProgram(["submit", "--task", "price_feed", "--intent", "ETH/USD", "--max-price", "0.10"])
		const opts = sub!.opts()
		expect(opts.task).toBe("price_feed")
		expect(opts.intent).toBe("ETH/USD")
		expect(opts.maxPrice).toBe("0.10")
		expect(opts.expiresIn).toBe("3600")
	})

	test("optional flags", () => {
		const { sub } = buildProgram([
			"submit", "--task", "search", "--intent", "find data",
			"--max-price", "0.50", "--constraints", '{"key":"val"}',
			"--proof-requirements", "source_urls,timestamps",
			"--expires-in", "120", "--buyer", "0xABC",
		])
		const opts = sub!.opts()
		expect(opts.constraints).toBe('{"key":"val"}')
		expect(opts.proofRequirements).toBe("source_urls,timestamps")
		expect(opts.expiresIn).toBe("120")
		expect(opts.buyer).toBe("0xABC")
	})

	test("errors on missing required flags", () => {
		expect(() => buildProgram(["submit", "--task", "search"])).toThrow()
	})
})

describe("px-buyer status", () => {
	test("parses --order", () => {
		const { sub } = buildProgram(["status", "--order", "abc-123"])
		expect(sub!.opts().order).toBe("abc-123")
	})

	test("errors without --order", () => {
		expect(() => buildProgram(["status"])).toThrow()
	})
})

describe("px-buyer wait", () => {
	test("parses all flags", () => {
		const { sub } = buildProgram(["wait", "--order", "abc", "--target", "matched", "--timeout", "5000", "--interval", "500"])
		const opts = sub!.opts()
		expect(opts.order).toBe("abc")
		expect(opts.target).toBe("matched")
		expect(opts.timeout).toBe("5000")
		expect(opts.interval).toBe("500")
	})

	test("defaults for timeout/interval", () => {
		const { sub } = buildProgram(["wait", "--order", "abc", "--target", "settled"])
		expect(sub!.opts().timeout).toBe("60000")
		expect(sub!.opts().interval).toBe("1000")
	})
})

describe("px-buyer settle", () => {
	test("parses --order", () => {
		const { sub } = buildProgram(["settle", "--order", "abc-123"])
		expect(sub!.opts().order).toBe("abc-123")
	})
})
