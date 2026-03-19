import { describe, it, expect, beforeEach } from "bun:test"
import { Orderbook } from "./orderbook"
import { submitFulfillment, settleOrder, getOrderResult } from "./lifecycle"
import type { BuyOrder, SellOrder, Fulfillment } from "@payload-exchange/protocol"
import type { Assignment } from "./orderbook"

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
		status: "open",
		createdAt: now,
		...overrides,
	}
}

function makeSellOrder(overrides: Partial<SellOrder> = {}): SellOrder {
	return {
		id: crypto.randomUUID(),
		seller: "solver:bob",
		supportedTaskClasses: ["price_feed"],
		pricingModel: "fixed",
		price: 5,
		currency: "USDC",
		executionTerms: undefined,
		stake: 0,
		reputation: {
			totalFulfilled: 0,
			successRate: 0.5,
			avgSettlementTime: "0s",
			disputes: 0,
			slashes: 0,
		},
		status: "open",
		createdAt: now,
		...overrides,
	}
}

function makePriceFeedResult() {
	const basePrice = 2500
	return {
		twap: basePrice,
		sources: [
			{ name: "binance", price: basePrice, timestamp: now },
			{ name: "coinbase", price: basePrice + 1, timestamp: now },
			{ name: "kraken", price: basePrice - 1, timestamp: now },
		],
	}
}

function makeFulfillment(orderId: string, overrides: Partial<Fulfillment> = {}): Fulfillment {
	return {
		id: crypto.randomUUID(),
		orderId,
		sellerId: "solver:bob",
		result: makePriceFeedResult(),
		proof: { verified: true },
		timestamp: now,
		...overrides,
	}
}

/**
 * Sets up an orderbook with a buy order in "matched" state,
 * with an assignment in place. Returns { book, buyOrder, sellOrder, assignment }.
 */
function setupMatchedOrder(buyOverrides: Partial<BuyOrder> = {}) {
	const book = new Orderbook()

	const buyOrder = makeBuyOrder({ status: "matched", ...buyOverrides })
	const sellOrder = makeSellOrder({ status: "matched" })

	book.addBuyOrder(buyOrder)
	book.addSellOrder(sellOrder)

	const assignment: Assignment = {
		id: crypto.randomUUID(),
		orderId: buyOrder.id,
		sellerId: sellOrder.seller,
		sellerOrderId: sellOrder.id,
		agreedPrice: 7.5,
		deadline: buyOrder.expiry,
		createdAt: now,
	}
	book.assignments.set(buyOrder.id, assignment)

	return { book, buyOrder, sellOrder, assignment }
}

// ─── submitFulfillment ──────────────────────────────────────────────────────

describe("submitFulfillment", () => {
	it("transitions matched order through executing -> fulfilled -> attested when attestation passes", () => {
		const { book, buyOrder } = setupMatchedOrder()
		const fulfillment = makeFulfillment(buyOrder.id)

		const { attestation } = submitFulfillment(book, fulfillment)

		expect(attestation.success).toBe(true)
		expect(book.getBuyOrder(buyOrder.id)!.status).toBe("attested")

		// Fulfillment should be stored
		const stored = book.fulfillments.get(buyOrder.id)
		expect(stored).toBeDefined()
		expect(stored!.id).toBe(fulfillment.id)

		// Attestation should be stored
		const storedAttest = book.attestations.get(buyOrder.id)
		expect(storedAttest).toBeDefined()
		expect(storedAttest!.success).toBe(true)
	})

	it("transitions to disputed when attestation fails (deadline expired)", () => {
		const { book, buyOrder } = setupMatchedOrder({ expiry: now - 100 })
		const fulfillment = makeFulfillment(buyOrder.id, { timestamp: now })

		const { attestation } = submitFulfillment(book, fulfillment)

		expect(attestation.success).toBe(false)
		expect(book.getBuyOrder(buyOrder.id)!.status).toBe("disputed")
		expect(attestation.reason).toBeDefined()
		expect(attestation.reason).toContain("deadline")
	})

	it("transitions to disputed when proof is missing", () => {
		const { book, buyOrder } = setupMatchedOrder()
		const fulfillment = makeFulfillment(buyOrder.id, { proof: undefined })

		const { attestation } = submitFulfillment(book, fulfillment)

		expect(attestation.success).toBe(false)
		expect(book.getBuyOrder(buyOrder.id)!.status).toBe("disputed")
		expect(attestation.reason).toContain("proof_present")
	})

	it("transitions to disputed when price feed sources are missing", () => {
		const { book, buyOrder } = setupMatchedOrder()
		const fulfillment = makeFulfillment(buyOrder.id, {
			result: {}, // no sources
			proof: { verified: true },
		})

		const { attestation } = submitFulfillment(book, fulfillment)

		expect(attestation.success).toBe(false)
		expect(book.getBuyOrder(buyOrder.id)!.status).toBe("disputed")
	})

	it("throws for non-existent order", () => {
		const book = new Orderbook()
		const fulfillment = makeFulfillment(crypto.randomUUID())

		expect(() => submitFulfillment(book, fulfillment)).toThrow("not found")
	})

	it("throws for order not in matched/executing state (open)", () => {
		const book = new Orderbook()
		const buyOrder = makeBuyOrder({ status: "open" })
		book.addBuyOrder(buyOrder)

		const fulfillment = makeFulfillment(buyOrder.id)

		expect(() => submitFulfillment(book, fulfillment)).toThrow("expected matched or executing")
	})

	it("throws for order in settled state", () => {
		const book = new Orderbook()
		const buyOrder = makeBuyOrder({ status: "settled" })
		book.addBuyOrder(buyOrder)

		const fulfillment = makeFulfillment(buyOrder.id)

		expect(() => submitFulfillment(book, fulfillment)).toThrow("expected matched or executing")
	})

	it("throws for order in disputed state", () => {
		const book = new Orderbook()
		const buyOrder = makeBuyOrder({ status: "disputed" })
		book.addBuyOrder(buyOrder)

		const fulfillment = makeFulfillment(buyOrder.id)

		expect(() => submitFulfillment(book, fulfillment)).toThrow("expected matched or executing")
	})

	it("accepts order in executing state", () => {
		const book = new Orderbook()
		const buyOrder = makeBuyOrder({ status: "executing" })
		book.addBuyOrder(buyOrder)

		const fulfillment = makeFulfillment(buyOrder.id)

		// Should not throw
		const { attestation } = submitFulfillment(book, fulfillment)
		expect(attestation).toBeDefined()
	})

	it("attestation includes checks array", () => {
		const { book, buyOrder } = setupMatchedOrder()
		const fulfillment = makeFulfillment(buyOrder.id)

		const { attestation } = submitFulfillment(book, fulfillment)

		expect(attestation.checks).toBeDefined()
		expect(Array.isArray(attestation.checks)).toBe(true)
		expect(attestation.checks!.length).toBeGreaterThan(0)

		// Should include deadline and proof_present checks at minimum
		const checkNames = attestation.checks!.map((c) => c.name)
		expect(checkNames).toContain("deadline")
		expect(checkNames).toContain("proof_present")
	})
})

// ─── settleOrder ────────────────────────────────────────────────────────────

describe("settleOrder", () => {
	function setupAttestedOrder() {
		const { book, buyOrder, sellOrder, assignment } = setupMatchedOrder()
		const fulfillment = makeFulfillment(buyOrder.id)
		submitFulfillment(book, fulfillment)
		// At this point, order should be "attested"
		return { book, buyOrder, sellOrder, assignment }
	}

	it("creates settlement with correct fee calculation (5% network fee)", () => {
		const { book, buyOrder, assignment } = setupAttestedOrder()

		const settlement = settleOrder(book, buyOrder.id)

		const expectedAgreedPrice = assignment.agreedPrice // 7.5
		const expectedFee = Number.parseFloat((expectedAgreedPrice * 0.05).toFixed(4))
		const expectedSellerReceived = Number.parseFloat(
			(expectedAgreedPrice - expectedFee).toFixed(4),
		)

		expect(settlement.buyerPaid).toBe(expectedAgreedPrice)
		expect(settlement.networkFee).toBe(expectedFee)
		expect(settlement.sellerReceived).toBe(expectedSellerReceived)
		expect(settlement.currency).toBe("USDC")
		expect(settlement.orderId).toBe(buyOrder.id)
	})

	it("transitions order to settled status", () => {
		const { book, buyOrder } = setupAttestedOrder()

		settleOrder(book, buyOrder.id)

		expect(book.getBuyOrder(buyOrder.id)!.status).toBe("settled")
	})

	it("stores settlement in orderbook", () => {
		const { book, buyOrder } = setupAttestedOrder()

		const settlement = settleOrder(book, buyOrder.id)

		const stored = book.settlements.get(buyOrder.id)
		expect(stored).toBeDefined()
		expect(stored!.id).toBe(settlement.id)
	})

	it("uses provided txHash", () => {
		const { book, buyOrder } = setupAttestedOrder()

		const settlement = settleOrder(book, buyOrder.id, "0xdeadbeef123")
		expect(settlement.txHash).toBe("0xdeadbeef123")
	})

	it("generates txHash when not provided", () => {
		const { book, buyOrder } = setupAttestedOrder()

		const settlement = settleOrder(book, buyOrder.id)
		expect(settlement.txHash).toBeDefined()
		expect(settlement.txHash!.startsWith("tx:")).toBe(true)
	})

	it("settlement method is tempo", () => {
		const { book, buyOrder } = setupAttestedOrder()

		const settlement = settleOrder(book, buyOrder.id)
		expect(settlement.method).toBe("tempo")
	})

	it("throws for non-existent order", () => {
		const book = new Orderbook()
		expect(() => settleOrder(book, crypto.randomUUID())).toThrow("not found")
	})

	it("throws for non-attested order (matched)", () => {
		const { book, buyOrder } = setupMatchedOrder()
		expect(() => settleOrder(book, buyOrder.id)).toThrow("expected attested")
	})

	it("throws for open order", () => {
		const book = new Orderbook()
		const buyOrder = makeBuyOrder({ status: "open" })
		book.addBuyOrder(buyOrder)
		expect(() => settleOrder(book, buyOrder.id)).toThrow("expected attested")
	})

	it("throws for disputed order", () => {
		const { book, buyOrder } = setupMatchedOrder({ expiry: now - 100 })
		const fulfillment = makeFulfillment(buyOrder.id, { timestamp: now })
		submitFulfillment(book, fulfillment)
		// order is now "disputed"
		expect(book.getBuyOrder(buyOrder.id)!.status).toBe("disputed")
		expect(() => settleOrder(book, buyOrder.id)).toThrow("expected attested")
	})

	it("uses maxPrice when no assignment exists", () => {
		const book = new Orderbook()
		const buyOrder = makeBuyOrder({ status: "attested", maxPrice: 20 })
		book.addBuyOrder(buyOrder)
		// No assignment set

		const settlement = settleOrder(book, buyOrder.id)
		expect(settlement.buyerPaid).toBe(20)
		expect(settlement.networkFee).toBe(1) // 20 * 0.05
		expect(settlement.sellerReceived).toBe(19) // 20 - 1
	})
})

// ─── getOrderResult ─────────────────────────────────────────────────────────

describe("getOrderResult", () => {
	it("returns full result chain for a settled order", () => {
		const { book, buyOrder } = setupMatchedOrder()
		const fulfillment = makeFulfillment(buyOrder.id)
		submitFulfillment(book, fulfillment)
		settleOrder(book, buyOrder.id)

		const result = getOrderResult(book, buyOrder.id)

		expect(result).toBeDefined()
		expect(result!.order).toBeDefined()
		expect(result!.order.id).toBe(buyOrder.id)
		expect(result!.order.status).toBe("settled")
		expect(result!.assignment).toBeDefined()
		expect(result!.fulfillment).toBeDefined()
		expect(result!.fulfillment!.id).toBe(fulfillment.id)
		expect(result!.attestation).toBeDefined()
		expect(result!.attestation!.success).toBe(true)
		expect(result!.settlement).toBeDefined()
		expect(result!.settlement!.orderId).toBe(buyOrder.id)
	})

	it("returns undefined for non-existent order", () => {
		const book = new Orderbook()
		expect(getOrderResult(book, "non-existent")).toBeUndefined()
	})

	it("returns partial result for order that is only matched", () => {
		const { book, buyOrder } = setupMatchedOrder()

		const result = getOrderResult(book, buyOrder.id)

		expect(result).toBeDefined()
		expect(result!.order.status).toBe("matched")
		expect(result!.assignment).toBeDefined()
		expect(result!.fulfillment).toBeUndefined()
		expect(result!.attestation).toBeUndefined()
		expect(result!.settlement).toBeUndefined()
	})

	it("returns partial result for attested but not settled order", () => {
		const { book, buyOrder } = setupMatchedOrder()
		const fulfillment = makeFulfillment(buyOrder.id)
		submitFulfillment(book, fulfillment)

		const result = getOrderResult(book, buyOrder.id)

		expect(result).toBeDefined()
		expect(result!.order.status).toBe("attested")
		expect(result!.fulfillment).toBeDefined()
		expect(result!.attestation).toBeDefined()
		expect(result!.settlement).toBeUndefined()
	})
})
