import { describe, it, expect } from "bun:test"
import {
	TaskClass,
	OrderStatus,
	BuyOrder,
	SellOrder,
	Fulfillment,
	Attestation,
	Settlement,
	Reputation,
	PricingModel,
} from "./schema"

// ─── Helpers ────────────────────────────────────────────────────────────────

const now = Math.floor(Date.now() / 1000)

function validBuyOrder(overrides: Record<string, unknown> = {}) {
	return {
		id: crypto.randomUUID(),
		buyer: "buyer:alice",
		taskClass: "price_feed" as const,
		intent: "Get ETH/USDC price",
		maxPrice: 10,
		expiry: now + 3600,
		createdAt: now,
		...overrides,
	}
}

function validSellOrder(overrides: Record<string, unknown> = {}) {
	return {
		id: crypto.randomUUID(),
		seller: "solver:bob",
		supportedTaskClasses: ["price_feed" as const],
		pricingModel: "fixed" as const,
		price: 5,
		createdAt: now,
		...overrides,
	}
}

function validFulfillment(overrides: Record<string, unknown> = {}) {
	return {
		id: crypto.randomUUID(),
		orderId: crypto.randomUUID(),
		sellerId: "solver:bob",
		result: { twap: 2500 },
		timestamp: now,
		...overrides,
	}
}

function validAttestation(overrides: Record<string, unknown> = {}) {
	return {
		id: crypto.randomUUID(),
		orderId: crypto.randomUUID(),
		success: true,
		attestors: ["attestor:v1"],
		timestamp: now,
		signatures: ["sig:attestor:v1"],
		...overrides,
	}
}

function validSettlement(overrides: Record<string, unknown> = {}) {
	return {
		id: crypto.randomUUID(),
		orderId: crypto.randomUUID(),
		buyerPaid: 10,
		sellerReceived: 9.5,
		networkFee: 0.5,
		currency: "USDC",
		timestamp: now,
		...overrides,
	}
}

// ─── TaskClass ──────────────────────────────────────────────────────────────

describe("TaskClass", () => {
	const validValues = [
		"onchain_swap",
		"bridge",
		"yield",
		"price_feed",
		"search",
		"computation",
		"monitoring",
		"smart_contract",
	] as const

	it.each(validValues.map((v) => [v]))("accepts valid value: %s", (value) => {
		expect(TaskClass.parse(value)).toBe(value)
	})

	it("rejects invalid value", () => {
		expect(() => TaskClass.parse("invalid_task")).toThrow()
	})

	it("rejects empty string", () => {
		expect(() => TaskClass.parse("")).toThrow()
	})

	it("has exactly 8 values", () => {
		expect(TaskClass.options).toHaveLength(8)
	})
})

// ─── OrderStatus ────────────────────────────────────────────────────────────

describe("OrderStatus", () => {
	const validStatuses = [
		"open",
		"matched",
		"executing",
		"fulfilled",
		"attested",
		"settled",
		"disputed",
		"expired",
		"cancelled",
	] as const

	it.each(validStatuses.map((v) => [v]))("accepts valid status: %s", (status) => {
		expect(OrderStatus.parse(status)).toBe(status)
	})

	it("has exactly 9 values", () => {
		expect(OrderStatus.options).toHaveLength(9)
	})

	it("rejects invalid status", () => {
		expect(() => OrderStatus.parse("pending")).toThrow()
	})
})

// ─── BuyOrder ───────────────────────────────────────────────────────────────

describe("BuyOrder", () => {
	it("parses a valid order", () => {
		const input = validBuyOrder()
		const parsed = BuyOrder.parse(input)
		expect(parsed.id).toBe(input.id)
		expect(parsed.buyer).toBe("buyer:alice")
		expect(parsed.taskClass).toBe("price_feed")
		expect(parsed.intent).toBe("Get ETH/USDC price")
		expect(parsed.maxPrice).toBe(10)
	})

	it("defaults currency to USDC", () => {
		const parsed = BuyOrder.parse(validBuyOrder())
		expect(parsed.currency).toBe("USDC")
	})

	it("defaults status to open", () => {
		const parsed = BuyOrder.parse(validBuyOrder())
		expect(parsed.status).toBe("open")
	})

	it("allows explicit currency override", () => {
		const parsed = BuyOrder.parse(validBuyOrder({ currency: "ETH" }))
		expect(parsed.currency).toBe("ETH")
	})

	it("allows explicit status override", () => {
		const parsed = BuyOrder.parse(validBuyOrder({ status: "matched" }))
		expect(parsed.status).toBe("matched")
	})

	it("fails when id is missing", () => {
		const { id: _, ...rest } = validBuyOrder()
		expect(() => BuyOrder.parse(rest)).toThrow()
	})

	it("fails when buyer is missing", () => {
		const { buyer: _, ...rest } = validBuyOrder()
		expect(() => BuyOrder.parse(rest)).toThrow()
	})

	it("fails when taskClass is missing", () => {
		const { taskClass: _, ...rest } = validBuyOrder()
		expect(() => BuyOrder.parse(rest)).toThrow()
	})

	it("fails when intent is missing", () => {
		const { intent: _, ...rest } = validBuyOrder()
		expect(() => BuyOrder.parse(rest)).toThrow()
	})

	it("fails when maxPrice is missing", () => {
		const { maxPrice: _, ...rest } = validBuyOrder()
		expect(() => BuyOrder.parse(rest)).toThrow()
	})

	it("fails when expiry is missing", () => {
		const { expiry: _, ...rest } = validBuyOrder()
		expect(() => BuyOrder.parse(rest)).toThrow()
	})

	it("fails when createdAt is missing", () => {
		const { createdAt: _, ...rest } = validBuyOrder()
		expect(() => BuyOrder.parse(rest)).toThrow()
	})

	it("rejects non-positive maxPrice", () => {
		expect(() => BuyOrder.parse(validBuyOrder({ maxPrice: 0 }))).toThrow()
		expect(() => BuyOrder.parse(validBuyOrder({ maxPrice: -1 }))).toThrow()
	})

	it("rejects non-integer expiry", () => {
		expect(() => BuyOrder.parse(validBuyOrder({ expiry: 123.45 }))).toThrow()
	})

	it("accepts optional constraints", () => {
		const parsed = BuyOrder.parse(validBuyOrder({ constraints: { sources: 5 } }))
		expect(parsed.constraints).toEqual({ sources: 5 })
	})

	it("accepts optional proofRequirements", () => {
		const parsed = BuyOrder.parse(validBuyOrder({ proofRequirements: ["twap", "sources"] }))
		expect(parsed.proofRequirements).toEqual(["twap", "sources"])
	})

	it("accepts optional disputeWindow", () => {
		const parsed = BuyOrder.parse(validBuyOrder({ disputeWindow: 300 }))
		expect(parsed.disputeWindow).toBe(300)
	})

	it("rejects non-integer disputeWindow", () => {
		expect(() => BuyOrder.parse(validBuyOrder({ disputeWindow: 1.5 }))).toThrow()
	})

	it("accepts optional parentOrderId", () => {
		const parentId = crypto.randomUUID()
		const parsed = BuyOrder.parse(validBuyOrder({ parentOrderId: parentId }))
		expect(parsed.parentOrderId).toBe(parentId)
	})

	it("rejects invalid parentOrderId (not UUID)", () => {
		expect(() => BuyOrder.parse(validBuyOrder({ parentOrderId: "not-a-uuid" }))).toThrow()
	})

	it("accepts optional signature", () => {
		const parsed = BuyOrder.parse(validBuyOrder({ signature: "sig:abc" }))
		expect(parsed.signature).toBe("sig:abc")
	})

	it("omits optional fields when not provided", () => {
		const parsed = BuyOrder.parse(validBuyOrder())
		expect(parsed.constraints).toBeUndefined()
		expect(parsed.proofRequirements).toBeUndefined()
		expect(parsed.disputeWindow).toBeUndefined()
		expect(parsed.parentOrderId).toBeUndefined()
		expect(parsed.signature).toBeUndefined()
	})

	it("rejects invalid id (not UUID)", () => {
		expect(() => BuyOrder.parse(validBuyOrder({ id: "not-a-uuid" }))).toThrow()
	})

	it("rejects invalid taskClass", () => {
		expect(() => BuyOrder.parse(validBuyOrder({ taskClass: "invalid" }))).toThrow()
	})
})

// ─── Reputation ─────────────────────────────────────────────────────────────

describe("Reputation", () => {
	it("applies all defaults from empty object", () => {
		const parsed = Reputation.parse({})
		expect(parsed.totalFulfilled).toBe(0)
		expect(parsed.successRate).toBe(0.5)
		expect(parsed.avgSettlementTime).toBe("0s")
		expect(parsed.disputes).toBe(0)
		expect(parsed.slashes).toBe(0)
	})

	it("accepts fully specified reputation", () => {
		const input = {
			totalFulfilled: 100,
			successRate: 0.95,
			avgSettlementTime: "12s",
			disputes: 2,
			slashes: 1,
		}
		const parsed = Reputation.parse(input)
		expect(parsed).toEqual(input)
	})

	it("clamps successRate: rejects values below 0", () => {
		expect(() => Reputation.parse({ successRate: -0.1 })).toThrow()
	})

	it("clamps successRate: rejects values above 1", () => {
		expect(() => Reputation.parse({ successRate: 1.1 })).toThrow()
	})

	it("accepts successRate at boundaries (0 and 1)", () => {
		expect(Reputation.parse({ successRate: 0 }).successRate).toBe(0)
		expect(Reputation.parse({ successRate: 1 }).successRate).toBe(1)
	})

	it("rejects negative totalFulfilled", () => {
		expect(() => Reputation.parse({ totalFulfilled: -1 })).toThrow()
	})

	it("rejects non-integer totalFulfilled", () => {
		expect(() => Reputation.parse({ totalFulfilled: 1.5 })).toThrow()
	})

	it("rejects negative disputes", () => {
		expect(() => Reputation.parse({ disputes: -1 })).toThrow()
	})

	it("rejects negative slashes", () => {
		expect(() => Reputation.parse({ slashes: -1 })).toThrow()
	})
})

// ─── PricingModel ───────────────────────────────────────────────────────────

describe("PricingModel", () => {
	it.each(["fixed", "percentage", "auction", "dynamic"].map((v) => [v]))(
		"accepts valid model: %s",
		(model) => {
			expect(PricingModel.parse(model)).toBe(model as any)
		},
	)

	it("rejects invalid model", () => {
		expect(() => PricingModel.parse("free")).toThrow()
	})
})

// ─── SellOrder ──────────────────────────────────────────────────────────────

describe("SellOrder", () => {
	it("parses a valid order", () => {
		const input = validSellOrder()
		const parsed = SellOrder.parse(input)
		expect(parsed.id).toBe(input.id)
		expect(parsed.seller).toBe("solver:bob")
		expect(parsed.supportedTaskClasses).toEqual(["price_feed"])
		expect(parsed.pricingModel).toBe("fixed")
		expect(parsed.price).toBe(5)
	})

	it("defaults reputation to empty object with defaults", () => {
		const parsed = SellOrder.parse(validSellOrder())
		expect(parsed.reputation).toEqual({
			totalFulfilled: 0,
			successRate: 0.5,
			avgSettlementTime: "0s",
			disputes: 0,
			slashes: 0,
		})
	})

	it("defaults stake to 0", () => {
		const parsed = SellOrder.parse(validSellOrder())
		expect(parsed.stake).toBe(0)
	})

	it("defaults status to open", () => {
		const parsed = SellOrder.parse(validSellOrder())
		expect(parsed.status).toBe("open")
	})

	it("defaults currency to USDC", () => {
		const parsed = SellOrder.parse(validSellOrder())
		expect(parsed.currency).toBe("USDC")
	})

	it("accepts executionTerms as record", () => {
		const parsed = SellOrder.parse(validSellOrder({ executionTerms: { timeout: 30, retries: 3 } }))
		expect(parsed.executionTerms).toEqual({ timeout: 30, retries: 3 })
	})

	it("validates pricingModel enum", () => {
		expect(() => SellOrder.parse(validSellOrder({ pricingModel: "free" }))).toThrow()
	})

	it("rejects negative price", () => {
		expect(() => SellOrder.parse(validSellOrder({ price: -1 }))).toThrow()
	})

	it("accepts zero price", () => {
		const parsed = SellOrder.parse(validSellOrder({ price: 0 }))
		expect(parsed.price).toBe(0)
	})

	it("rejects negative stake", () => {
		expect(() => SellOrder.parse(validSellOrder({ stake: -1 }))).toThrow()
	})

	it("fails when seller is missing", () => {
		const { seller: _, ...rest } = validSellOrder()
		expect(() => SellOrder.parse(rest)).toThrow()
	})

	it("fails when supportedTaskClasses is missing", () => {
		const { supportedTaskClasses: _, ...rest } = validSellOrder()
		expect(() => SellOrder.parse(rest)).toThrow()
	})

	it("rejects invalid task class in supportedTaskClasses", () => {
		expect(() => SellOrder.parse(validSellOrder({ supportedTaskClasses: ["invalid_class"] }))).toThrow()
	})

	it("accepts optional signature", () => {
		const parsed = SellOrder.parse(validSellOrder({ signature: "sig:xyz" }))
		expect(parsed.signature).toBe("sig:xyz")
	})
})

// ─── Fulfillment ────────────────────────────────────────────────────────────

describe("Fulfillment", () => {
	it("parses a valid fulfillment", () => {
		const input = validFulfillment()
		const parsed = Fulfillment.parse(input)
		expect(parsed.id).toBe(input.id)
		expect(parsed.orderId).toBe(input.orderId)
		expect(parsed.sellerId).toBe("solver:bob")
		expect(parsed.result).toEqual({ twap: 2500 })
		expect(parsed.timestamp).toBe(input.timestamp)
	})

	it("accepts optional proof as record", () => {
		const parsed = Fulfillment.parse(validFulfillment({ proof: { hash: "0xabc", verified: true } }))
		expect(parsed.proof).toEqual({ hash: "0xabc", verified: true })
	})

	it("accepts optional executionTime", () => {
		const parsed = Fulfillment.parse(validFulfillment({ executionTime: "1.2s" }))
		expect(parsed.executionTime).toBe("1.2s")
	})

	it("omits optional fields when not provided", () => {
		const parsed = Fulfillment.parse(validFulfillment())
		expect(parsed.proof).toBeUndefined()
		expect(parsed.executionTime).toBeUndefined()
		expect(parsed.sellerSignature).toBeUndefined()
	})

	it("fails when id is missing", () => {
		const { id: _, ...rest } = validFulfillment()
		expect(() => Fulfillment.parse(rest)).toThrow()
	})

	it("fails when orderId is missing", () => {
		const { orderId: _, ...rest } = validFulfillment()
		expect(() => Fulfillment.parse(rest)).toThrow()
	})

	it("rejects invalid orderId (not UUID)", () => {
		expect(() => Fulfillment.parse(validFulfillment({ orderId: "not-uuid" }))).toThrow()
	})

	it("rejects non-integer timestamp", () => {
		expect(() => Fulfillment.parse(validFulfillment({ timestamp: 123.456 }))).toThrow()
	})

	it("accepts sellerSignature", () => {
		const parsed = Fulfillment.parse(validFulfillment({ sellerSignature: "sig:seller" }))
		expect(parsed.sellerSignature).toBe("sig:seller")
	})
})

// ─── Attestation ────────────────────────────────────────────────────────────

describe("Attestation", () => {
	it("parses a valid attestation", () => {
		const input = validAttestation()
		const parsed = Attestation.parse(input)
		expect(parsed.id).toBe(input.id)
		expect(parsed.orderId).toBe(input.orderId)
		expect(parsed.success).toBe(true)
		expect(parsed.attestors).toEqual(["attestor:v1"])
		expect(parsed.signatures).toEqual(["sig:attestor:v1"])
	})

	it("accepts checks array", () => {
		const checks = [
			{ name: "deadline", passed: true },
			{ name: "proof_present", passed: true, value: "OK" },
		]
		const parsed = Attestation.parse(validAttestation({ checks }))
		expect(parsed.checks).toHaveLength(2)
		expect(parsed.checks![0].name).toBe("deadline")
		expect(parsed.checks![0].passed).toBe(true)
		expect(parsed.checks![1].value).toBe("OK")
	})

	it("attestors and signatures are parallel arrays", () => {
		const parsed = Attestation.parse(
			validAttestation({
				attestors: ["a1", "a2", "a3"],
				signatures: ["s1", "s2", "s3"],
			}),
		)
		expect(parsed.attestors).toHaveLength(3)
		expect(parsed.signatures).toHaveLength(3)
		expect(parsed.attestors[0]).toBe("a1")
		expect(parsed.signatures[0]).toBe("s1")
	})

	it("accepts optional reason", () => {
		const parsed = Attestation.parse(validAttestation({ success: false, reason: "deadline missed" }))
		expect(parsed.reason).toBe("deadline missed")
	})

	it("fails when attestors is missing", () => {
		const { attestors: _, ...rest } = validAttestation()
		expect(() => Attestation.parse(rest)).toThrow()
	})

	it("fails when signatures is missing", () => {
		const { signatures: _, ...rest } = validAttestation()
		expect(() => Attestation.parse(rest)).toThrow()
	})

	it("fails when success is missing", () => {
		const { success: _, ...rest } = validAttestation()
		expect(() => Attestation.parse(rest)).toThrow()
	})
})

// ─── Settlement ─────────────────────────────────────────────────────────────

describe("Settlement", () => {
	it("parses a valid settlement", () => {
		const input = validSettlement()
		const parsed = Settlement.parse(input)
		expect(parsed.id).toBe(input.id)
		expect(parsed.orderId).toBe(input.orderId)
		expect(parsed.buyerPaid).toBe(10)
		expect(parsed.sellerReceived).toBe(9.5)
		expect(parsed.networkFee).toBe(0.5)
		expect(parsed.currency).toBe("USDC")
	})

	it("accepts optional method", () => {
		const parsed = Settlement.parse(validSettlement({ method: "tempo" }))
		expect(parsed.method).toBe("tempo")
	})

	it("method is optional", () => {
		const parsed = Settlement.parse(validSettlement())
		expect(parsed.method).toBeUndefined()
	})

	it("accepts optional txHash", () => {
		const parsed = Settlement.parse(validSettlement({ txHash: "0xdeadbeef" }))
		expect(parsed.txHash).toBe("0xdeadbeef")
	})

	it("fails when buyerPaid is missing", () => {
		const { buyerPaid: _, ...rest } = validSettlement()
		expect(() => Settlement.parse(rest)).toThrow()
	})

	it("fails when currency is missing", () => {
		const { currency: _, ...rest } = validSettlement()
		expect(() => Settlement.parse(rest)).toThrow()
	})

	it("rejects non-integer timestamp", () => {
		expect(() => Settlement.parse(validSettlement({ timestamp: 1.5 }))).toThrow()
	})
})
