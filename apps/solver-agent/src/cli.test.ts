import { describe, expect, test } from "bun:test"
import { Command } from "commander"

function buildProgram(argv: string[], env: Record<string, string | undefined> = {}) {
	const program = new Command()
		.name("px-solver")
		.option("--coordinator <url>", "Coordinator URL", env.COORDINATOR_URL ?? "https://px-test.fly.dev")
		.option("--address <addr>", "Override wallet address")
		.option("--json", "Output raw JSON")
		.exitOverride()

	const register = new Command("register")
		.requiredOption("--tasks <csv>", "Task classes")
		.requiredOption("--price <n>", "Fee")
		.option("--pricing-model <model>", "Pricing model", "fixed")
		.option("--stake <n>", "Stake", "0")
		.option("--execution-terms <json>", "Execution terms")
		.option("--seller <address>", "Seller address")
		.exitOverride()

	const order = new Command("order")
		.requiredOption("--order <id>", "Order ID")
		.exitOverride()

	const fulfill = new Command("fulfill")
		.requiredOption("--order <id>", "Order ID")
		.option("--result <json>", "Result JSON")
		.option("--result-file <path>", "Result file")
		.option("--result-stdin", "Read from stdin")
		.option("--proof <json>", "Proof JSON")
		.option("--execution-time <str>", "Execution time")
		.option("--seller <address>", "Seller address")
		.exitOverride()

	const listen = new Command("listen")
		.option("--tasks <csv>", "Task classes")
		.option("--exec <command>", "Exec command")
		.option("--exec-timeout <ms>", "Exec timeout", "30000")
		.option("--auto-fulfill", "Auto-fulfill")
		.option("--seller <address>", "Seller address")
		.exitOverride()

	program.addCommand(register)
	program.addCommand(order)
	program.addCommand(fulfill)
	program.addCommand(listen)

	program.parse(["node", "px-solver", ...argv])
	return { program, sub: program.commands.find((c) => argv.includes(c.name())) }
}

describe("px-solver global options", () => {
	test("defaults", () => {
		const { program } = buildProgram(["register", "--tasks", "price_feed", "--price", "0.05"])
		const opts = program.opts()
		expect(opts.coordinator).toBe("https://px-test.fly.dev")
		expect(opts.address).toBeUndefined()
		expect(opts.json).toBeUndefined()
	})

	test("env var fallback", () => {
		const { program } = buildProgram(
			["register", "--tasks", "price_feed", "--price", "0.05"],
			{ COORDINATOR_URL: "http://env:4000" },
		)
		expect(program.opts().coordinator).toBe("http://env:4000")
	})

	test("CLI flags override env vars", () => {
		const { program } = buildProgram(
			["--coordinator", "http://cli:4000", "register", "--tasks", "price_feed", "--price", "0.05"],
			{ COORDINATOR_URL: "http://env:4000" },
		)
		expect(program.opts().coordinator).toBe("http://cli:4000")
	})

	test("--json flag", () => {
		const { program } = buildProgram(["--json", "register", "--tasks", "price_feed", "--price", "0.05"])
		expect(program.opts().json).toBe(true)
	})
})

describe("px-solver register", () => {
	test("parses required flags", () => {
		const { sub } = buildProgram(["register", "--tasks", "price_feed,search", "--price", "0.15"])
		const opts = sub!.opts()
		expect(opts.tasks).toBe("price_feed,search")
		expect(opts.price).toBe("0.15")
		expect(opts.pricingModel).toBe("fixed")
		expect(opts.stake).toBe("0")
	})

	test("optional flags", () => {
		const { sub } = buildProgram([
			"register", "--tasks", "search", "--price", "0.20",
			"--pricing-model", "auction", "--stake", "50",
			"--execution-terms", '{"maxLatency":"5s"}',
			"--seller", "0xABC",
		])
		const opts = sub!.opts()
		expect(opts.pricingModel).toBe("auction")
		expect(opts.stake).toBe("50")
		expect(opts.executionTerms).toBe('{"maxLatency":"5s"}')
		expect(opts.seller).toBe("0xABC")
	})

	test("errors on missing --tasks", () => {
		expect(() => buildProgram(["register", "--price", "0.05"])).toThrow()
	})
})

describe("px-solver order", () => {
	test("parses --order", () => {
		const { sub } = buildProgram(["order", "--order", "abc-123"])
		expect(sub!.opts().order).toBe("abc-123")
	})

	test("errors without --order", () => {
		expect(() => buildProgram(["order"])).toThrow()
	})
})

describe("px-solver fulfill", () => {
	test("parses result flags", () => {
		const { sub } = buildProgram([
			"fulfill", "--order", "abc-123",
			"--result", '{"price":3421.5}',
			"--proof", '{"source":"binance"}',
			"--execution-time", "150ms",
		])
		const opts = sub!.opts()
		expect(opts.order).toBe("abc-123")
		expect(opts.result).toBe('{"price":3421.5}')
		expect(opts.proof).toBe('{"source":"binance"}')
		expect(opts.executionTime).toBe("150ms")
	})

	test("result-stdin flag", () => {
		const { sub } = buildProgram(["fulfill", "--order", "abc", "--result-stdin"])
		expect(sub!.opts().resultStdin).toBe(true)
	})

	test("errors without --order", () => {
		expect(() => buildProgram(["fulfill"])).toThrow()
	})
})

describe("px-solver listen", () => {
	test("parses all flags", () => {
		const { sub } = buildProgram([
			"listen", "--tasks", "price_feed,search",
			"--exec", "./handler.sh",
			"--exec-timeout", "5000",
			"--auto-fulfill",
			"--seller", "0xABC",
		])
		const opts = sub!.opts()
		expect(opts.tasks).toBe("price_feed,search")
		expect(opts.exec).toBe("./handler.sh")
		expect(opts.execTimeout).toBe("5000")
		expect(opts.autoFulfill).toBe(true)
		expect(opts.seller).toBe("0xABC")
	})

	test("defaults", () => {
		const { sub } = buildProgram(["listen"])
		const opts = sub!.opts()
		expect(opts.tasks).toBeUndefined()
		expect(opts.exec).toBeUndefined()
		expect(opts.execTimeout).toBe("30000")
		expect(opts.autoFulfill).toBeUndefined()
	})

	test("comma-separated tasks parse", () => {
		const { sub } = buildProgram(["listen", "--tasks", "price_feed,search,computation"])
		const tasks = sub!.opts().tasks.split(",").map((s: string) => s.trim())
		expect(tasks).toEqual(["price_feed", "search", "computation"])
	})
})
