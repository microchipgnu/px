import { describe, it, expect } from "bun:test"
import { verify, checkPriceFeed, checkDeadline, checkProofPresent } from "./index"
import type { BuyOrder, Fulfillment, AttestationCheck } from "@payload-exchange/protocol"

// ─── Helpers ────────────────────────────────────────────────────────────────

const now = Math.floor(Date.now() / 1000)

function makeBuyOrder(overrides: Partial<BuyOrder> = {}): BuyOrder {
	return {
		id: crypto.randomUUID(),
		buyer: "buyer:alice",
		taskClass: "price_feed",
		intent: "Get ETH/USDC price",
		maxPrice: 10,
		currency: "USDC",
		expiry: now + 3600,
		status: "matched",
		createdAt: now,
		...overrides,
	}
}

function makeFulfillment(overrides: Partial<Fulfillment> & { orderId?: string } = {}): Fulfillment {
	return {
		id: crypto.randomUUID(),
		orderId: crypto.randomUUID(),
		sellerId: "solver:bob",
		result: undefined,
		timestamp: now,
		...overrides,
	}
}

function makePriceFeedResult(overrides: Record<string, unknown> = {}) {
	const basePrice = 2500
	return {
		twap: basePrice,
		sources: [
			{ name: "binance", price: basePrice, timestamp: now },
			{ name: "coinbase", price: basePrice + 1, timestamp: now },
			{ name: "kraken", price: basePrice - 1, timestamp: now },
		],
		...overrides,
	}
}

// ─── checkPriceFeed ─────────────────────────────────────────────────────────

describe("checkPriceFeed", () => {
	it("passes with 3 valid sources, correct TWAP, and fresh timestamps", () => {
		const buyOrder = makeBuyOrder({ constraints: { sources: 3, maxAge: 60, maxVariance: 0.02 } })
		const fulfillment = makeFulfillment({
			orderId: buyOrder.id,
			result: makePriceFeedResult(),
			proof: { verified: true },
		})

		const checks = checkPriceFeed(fulfillment, buyOrder)

		const checkMap = Object.fromEntries(checks.map((c) => [c.name, c]))
		expect(checkMap.source_count.passed).toBe(true)
		expect(checkMap.valid_prices.passed).toBe(true)
		expect(checkMap.price_variance.passed).toBe(true)
		expect(checkMap.timestamp_freshness.passed).toBe(true)
		expect(checkMap.twap_accuracy.passed).toBe(true)

		// All checks should pass
		expect(checks.every((c) => c.passed)).toBe(true)
	})

	it("fails with only 1 source when 3 required", () => {
		const buyOrder = makeBuyOrder({ constraints: { sources: 3 } })
		const fulfillment = makeFulfillment({
			orderId: buyOrder.id,
			result: {
				twap: 2500,
				sources: [{ name: "binance", price: 2500, timestamp: now }],
			},
		})

		const checks = checkPriceFeed(fulfillment, buyOrder)
		const sourceCount = checks.find((c) => c.name === "source_count")
		expect(sourceCount).toBeDefined()
		expect(sourceCount!.passed).toBe(false)
		expect(sourceCount!.value).toBe(1)
	})

	it("fails with stale timestamps (>60s old)", () => {
		const staleTime = now - 120 // 2 minutes ago
		const buyOrder = makeBuyOrder({ constraints: { maxAge: 60 } })
		const fulfillment = makeFulfillment({
			orderId: buyOrder.id,
			result: {
				twap: 2500,
				sources: [
					{ name: "binance", price: 2500, timestamp: staleTime },
					{ name: "coinbase", price: 2501, timestamp: staleTime },
					{ name: "kraken", price: 2499, timestamp: staleTime },
				],
			},
		})

		const checks = checkPriceFeed(fulfillment, buyOrder)
		const freshness = checks.find((c) => c.name === "timestamp_freshness")
		expect(freshness).toBeDefined()
		expect(freshness!.passed).toBe(false)
		expect(freshness!.value).toBe("stale timestamps detected")
	})

	it("fails with high price variance (>2%)", () => {
		const buyOrder = makeBuyOrder({ constraints: { maxVariance: 0.02 } })
		const fulfillment = makeFulfillment({
			orderId: buyOrder.id,
			result: {
				twap: 2500,
				sources: [
					{ name: "binance", price: 2500, timestamp: now },
					{ name: "coinbase", price: 2700, timestamp: now }, // ~8% higher
					{ name: "kraken", price: 2300, timestamp: now }, // ~8% lower
				],
			},
		})

		const checks = checkPriceFeed(fulfillment, buyOrder)
		const variance = checks.find((c) => c.name === "price_variance")
		expect(variance).toBeDefined()
		expect(variance!.passed).toBe(false)
	})

	it("fails with missing TWAP", () => {
		const buyOrder = makeBuyOrder()
		const fulfillment = makeFulfillment({
			orderId: buyOrder.id,
			result: {
				sources: [
					{ name: "binance", price: 2500, timestamp: now },
					{ name: "coinbase", price: 2501, timestamp: now },
					{ name: "kraken", price: 2499, timestamp: now },
				],
			},
		})

		const checks = checkPriceFeed(fulfillment, buyOrder)
		const twap = checks.find((c) => c.name === "twap_present")
		expect(twap).toBeDefined()
		expect(twap!.passed).toBe(false)
		expect(twap!.value).toBe("missing or invalid TWAP")
	})

	it("fails with no sources at all", () => {
		const buyOrder = makeBuyOrder()
		const fulfillment = makeFulfillment({
			orderId: buyOrder.id,
			result: {},
		})

		const checks = checkPriceFeed(fulfillment, buyOrder)
		const sourcesPresent = checks.find((c) => c.name === "sources_present")
		expect(sourcesPresent).toBeDefined()
		expect(sourcesPresent!.passed).toBe(false)
		expect(sourcesPresent!.value).toBe("no sources in result")
		// Should return early with only this one check
		expect(checks).toHaveLength(1)
	})

	it("fails when sources is not an array", () => {
		const buyOrder = makeBuyOrder()
		const fulfillment = makeFulfillment({
			orderId: buyOrder.id,
			result: { sources: "not-an-array" },
		})

		const checks = checkPriceFeed(fulfillment, buyOrder)
		const sourcesPresent = checks.find((c) => c.name === "sources_present")
		expect(sourcesPresent!.passed).toBe(false)
	})
})

// ─── Common checks ──────────────────────────────────────────────────────────

describe("checkDeadline", () => {
	it("passes when fulfillment is before expiry", () => {
		const buyOrder = makeBuyOrder({ expiry: now + 3600 })
		const fulfillment = makeFulfillment({ timestamp: now })

		const check = checkDeadline(fulfillment, buyOrder)
		expect(check.name).toBe("deadline")
		expect(check.passed).toBe(true)
		expect(check.value).toBeUndefined()
	})

	it("passes when fulfillment is exactly at expiry", () => {
		const expiry = now + 100
		const buyOrder = makeBuyOrder({ expiry })
		const fulfillment = makeFulfillment({ timestamp: expiry })

		const check = checkDeadline(fulfillment, buyOrder)
		expect(check.passed).toBe(true)
	})

	it("fails when fulfillment is after expiry", () => {
		const expiry = now - 60
		const buyOrder = makeBuyOrder({ expiry })
		const fulfillment = makeFulfillment({ timestamp: now })

		const check = checkDeadline(fulfillment, buyOrder)
		expect(check.name).toBe("deadline")
		expect(check.passed).toBe(false)
		expect(check.value).toContain(`fulfilled at ${now}`)
		expect(check.value).toContain(`deadline was ${expiry}`)
	})
})

describe("checkProofPresent", () => {
	it("passes with non-empty proof object", () => {
		const fulfillment = makeFulfillment({ proof: { hash: "0xabc" } })
		const check = checkProofPresent(fulfillment)
		expect(check.name).toBe("proof_present")
		expect(check.passed).toBe(true)
	})

	it("fails with null proof", () => {
		const fulfillment = makeFulfillment({ proof: undefined })
		const check = checkProofPresent(fulfillment)
		expect(check.name).toBe("proof_present")
		expect(check.passed).toBe(false)
	})

	it("fails with empty proof object", () => {
		const fulfillment = makeFulfillment({ proof: {} })
		const check = checkProofPresent(fulfillment)
		expect(check.passed).toBe(false)
	})

	it("fails when proof is not set at all", () => {
		const fulfillment = makeFulfillment()
		const check = checkProofPresent(fulfillment)
		expect(check.passed).toBe(false)
	})
})

// ─── verify() ───────────────────────────────────────────────────────────────

describe("verify", () => {
	it("returns success=true when all checks pass", () => {
		const buyOrder = makeBuyOrder({
			taskClass: "price_feed",
			expiry: now + 3600,
		})
		const fulfillment = makeFulfillment({
			orderId: buyOrder.id,
			timestamp: now,
			proof: { verified: true },
			result: makePriceFeedResult(),
		})

		const attestation = verify(fulfillment, buyOrder)
		expect(attestation.success).toBe(true)
		expect(attestation.orderId).toBe(buyOrder.id)
		expect(attestation.reason).toBeUndefined()
		expect(attestation.attestors).toEqual(["attestor:coordinator-v1"])
		expect(attestation.signatures).toHaveLength(1)
		expect(attestation.checks).toBeDefined()
		expect(attestation.checks!.every((c) => c.passed)).toBe(true)
	})

	it("returns success=false with reason when deadline check fails", () => {
		const buyOrder = makeBuyOrder({
			taskClass: "price_feed",
			expiry: now - 100, // expired
		})
		const fulfillment = makeFulfillment({
			orderId: buyOrder.id,
			timestamp: now,
			proof: { verified: true },
			result: makePriceFeedResult(),
		})

		const attestation = verify(fulfillment, buyOrder)
		expect(attestation.success).toBe(false)
		expect(attestation.reason).toBeDefined()
		expect(attestation.reason).toContain("deadline")
	})

	it("returns success=false when proof is missing", () => {
		const buyOrder = makeBuyOrder({
			taskClass: "price_feed",
			expiry: now + 3600,
		})
		const fulfillment = makeFulfillment({
			orderId: buyOrder.id,
			timestamp: now,
			// no proof
			result: makePriceFeedResult(),
		})

		const attestation = verify(fulfillment, buyOrder)
		expect(attestation.success).toBe(false)
		expect(attestation.reason).toContain("proof_present")
	})

	it("returns success=false when price feed checks fail", () => {
		const buyOrder = makeBuyOrder({
			taskClass: "price_feed",
			expiry: now + 3600,
		})
		const fulfillment = makeFulfillment({
			orderId: buyOrder.id,
			timestamp: now,
			proof: { verified: true },
			result: {}, // missing sources => price feed check fails
		})

		const attestation = verify(fulfillment, buyOrder)
		expect(attestation.success).toBe(false)
		expect(attestation.reason).toContain("sources_present")
	})

	it("auto-passes unknown task classes with warning", () => {
		const buyOrder = makeBuyOrder({
			taskClass: "computation", // no specific verifier
			expiry: now + 3600,
		})
		const fulfillment = makeFulfillment({
			orderId: buyOrder.id,
			timestamp: now,
			proof: { data: "result" },
			result: { answer: 42 },
		})

		const attestation = verify(fulfillment, buyOrder)
		expect(attestation.success).toBe(true)

		const taskClassCheck = attestation.checks!.find((c) => c.name === "task_class_verifier")
		expect(taskClassCheck).toBeDefined()
		expect(taskClassCheck!.passed).toBe(true)
		expect(taskClassCheck!.value).toContain("no verifier for computation")
		expect(taskClassCheck!.value).toContain("auto-passing")
	})

	it("uses custom attestorId when provided", () => {
		const buyOrder = makeBuyOrder({ taskClass: "computation", expiry: now + 3600 })
		const fulfillment = makeFulfillment({
			orderId: buyOrder.id,
			timestamp: now,
			proof: { data: true },
		})

		const attestation = verify(fulfillment, buyOrder, "attestor:custom-v2")
		expect(attestation.attestors).toEqual(["attestor:custom-v2"])
	})

	it("includes all failing check names in reason", () => {
		const buyOrder = makeBuyOrder({
			taskClass: "price_feed",
			expiry: now - 100, // deadline fail
		})
		const fulfillment = makeFulfillment({
			orderId: buyOrder.id,
			timestamp: now,
			// no proof => proof_present fail
			result: {}, // no sources => sources_present fail
		})

		const attestation = verify(fulfillment, buyOrder)
		expect(attestation.success).toBe(false)
		expect(attestation.reason).toContain("deadline")
		expect(attestation.reason).toContain("proof_present")
		expect(attestation.reason).toContain("sources_present")
	})

	it("generates valid UUID for attestation id", () => {
		const buyOrder = makeBuyOrder({ taskClass: "computation", expiry: now + 3600 })
		const fulfillment = makeFulfillment({
			orderId: buyOrder.id,
			timestamp: now,
			proof: { data: true },
		})

		const attestation = verify(fulfillment, buyOrder)
		// UUID v4 pattern
		expect(attestation.id).toMatch(
			/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
		)
	})
})
