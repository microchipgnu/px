import { describe, it, expect, beforeEach } from "bun:test"
import { Orderbook } from "./orderbook"
import { runMatchingCycle } from "./matcher"
import type { BuyOrder, SellOrder } from "@payload-exchange/protocol"

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

// ─── Tests ──────────────────────────────────────────────────────────────────

describe("runMatchingCycle", () => {
	let book: Orderbook

	beforeEach(() => {
		book = new Orderbook()
	})

	it("matches compatible buy/sell orders (task class matches, price compatible)", () => {
		const buy = makeBuyOrder({ taskClass: "price_feed", maxPrice: 10 })
		const sell = makeSellOrder({
			supportedTaskClasses: ["price_feed"],
			price: 5,
		})

		book.addBuyOrder(buy)
		book.addSellOrder(sell)

		const results = runMatchingCycle(book)

		expect(results).toHaveLength(1)
		expect(results[0].buyOrder.id).toBe(buy.id)
		expect(results[0].sellOrder.id).toBe(sell.id)
	})

	it("does NOT match when task classes don't overlap", () => {
		const buy = makeBuyOrder({ taskClass: "price_feed", maxPrice: 10 })
		const sell = makeSellOrder({
			supportedTaskClasses: ["computation"],
			price: 5,
		})

		book.addBuyOrder(buy)
		book.addSellOrder(sell)

		const results = runMatchingCycle(book)
		expect(results).toHaveLength(0)
	})

	it("does NOT match when solver price > buyer maxPrice", () => {
		const buy = makeBuyOrder({ taskClass: "price_feed", maxPrice: 5 })
		const sell = makeSellOrder({
			supportedTaskClasses: ["price_feed"],
			price: 10, // too expensive
		})

		book.addBuyOrder(buy)
		book.addSellOrder(sell)

		const results = runMatchingCycle(book)
		expect(results).toHaveLength(0)
	})

	it("picks cheapest solver when multiple are compatible", () => {
		const buy = makeBuyOrder({ taskClass: "price_feed", maxPrice: 20 })
		const expensive = makeSellOrder({
			seller: "solver:expensive",
			supportedTaskClasses: ["price_feed"],
			price: 15,
		})
		const cheap = makeSellOrder({
			seller: "solver:cheap",
			supportedTaskClasses: ["price_feed"],
			price: 3,
		})
		const mid = makeSellOrder({
			seller: "solver:mid",
			supportedTaskClasses: ["price_feed"],
			price: 8,
		})

		book.addBuyOrder(buy)
		book.addSellOrder(expensive)
		book.addSellOrder(cheap)
		book.addSellOrder(mid)

		const results = runMatchingCycle(book)

		expect(results).toHaveLength(1)
		expect(results[0].sellOrder.seller).toBe("solver:cheap")
	})

	it("agreed price is midpoint between seller price and buyer maxPrice", () => {
		const buy = makeBuyOrder({ taskClass: "price_feed", maxPrice: 20 })
		const sell = makeSellOrder({
			supportedTaskClasses: ["price_feed"],
			price: 10,
		})

		book.addBuyOrder(buy)
		book.addSellOrder(sell)

		const results = runMatchingCycle(book)
		expect(results).toHaveLength(1)

		// midpoint: 10 + (20 - 10) * 0.5 = 15
		expect(results[0].assignment.agreedPrice).toBe(15)
	})

	it("rounds agreed price to 4 decimal places", () => {
		const buy = makeBuyOrder({ taskClass: "price_feed", maxPrice: 10 })
		const sell = makeSellOrder({
			supportedTaskClasses: ["price_feed"],
			price: 3,
		})

		book.addBuyOrder(buy)
		book.addSellOrder(sell)

		const results = runMatchingCycle(book)
		// midpoint: 3 + (10 - 3) * 0.5 = 6.5
		expect(results[0].assignment.agreedPrice).toBe(6.5)

		// Verify rounding by using numbers that need it
		const book2 = new Orderbook()
		const buy2 = makeBuyOrder({ taskClass: "price_feed", maxPrice: 10 })
		const sell2 = makeSellOrder({
			supportedTaskClasses: ["price_feed"],
			price: 3.333,
		})
		book2.addBuyOrder(buy2)
		book2.addSellOrder(sell2)

		const results2 = runMatchingCycle(book2)
		// midpoint: 3.333 + (10 - 3.333) * 0.5 = 6.6665
		expect(results2[0].assignment.agreedPrice).toBe(6.6665)
	})

	it("updates both orders to matched status", () => {
		const buy = makeBuyOrder({ taskClass: "price_feed", maxPrice: 10 })
		const sell = makeSellOrder({
			supportedTaskClasses: ["price_feed"],
			price: 5,
		})

		book.addBuyOrder(buy)
		book.addSellOrder(sell)

		runMatchingCycle(book)

		expect(book.getBuyOrder(buy.id)!.status).toBe("matched")
		expect(book.getSellOrder(sell.id)!.status).toBe("matched")
	})

	it("creates assignment with correct fields", () => {
		const buy = makeBuyOrder({ taskClass: "price_feed", maxPrice: 10 })
		const sell = makeSellOrder({
			supportedTaskClasses: ["price_feed"],
			price: 4,
		})

		book.addBuyOrder(buy)
		book.addSellOrder(sell)

		const results = runMatchingCycle(book)
		const assignment = results[0].assignment

		expect(assignment.id).toBeDefined()
		expect(assignment.id).toMatch(
			/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
		)
		expect(assignment.orderId).toBe(buy.id)
		expect(assignment.sellerId).toBe(sell.seller)
		expect(assignment.sellerOrderId).toBe(sell.id)
		expect(assignment.agreedPrice).toBe(7) // 4 + (10-4)*0.5
		expect(assignment.deadline).toBe(buy.expiry)
		expect(typeof assignment.createdAt).toBe("number")

		// Also stored in orderbook
		const stored = book.assignments.get(buy.id)
		expect(stored).toBeDefined()
		expect(stored!.id).toBe(assignment.id)
	})

	it("handles empty orderbook gracefully", () => {
		const results = runMatchingCycle(book)
		expect(results).toHaveLength(0)
	})

	it("handles orderbook with only buy orders", () => {
		book.addBuyOrder(makeBuyOrder())
		const results = runMatchingCycle(book)
		expect(results).toHaveLength(0)
	})

	it("handles orderbook with only sell orders", () => {
		book.addSellOrder(makeSellOrder())
		const results = runMatchingCycle(book)
		expect(results).toHaveLength(0)
	})

	it("one matching cycle doesn't match same sell order twice", () => {
		const buy1 = makeBuyOrder({
			buyer: "buyer:alice",
			taskClass: "price_feed",
			maxPrice: 20,
		})
		const buy2 = makeBuyOrder({
			buyer: "buyer:bob",
			taskClass: "price_feed",
			maxPrice: 15,
		})
		const sell = makeSellOrder({
			supportedTaskClasses: ["price_feed"],
			price: 5,
		})

		book.addBuyOrder(buy1)
		book.addBuyOrder(buy2)
		book.addSellOrder(sell)

		const results = runMatchingCycle(book)

		// Only one of the two buys should be matched
		expect(results).toHaveLength(1)
		// The highest-paying buyer gets priority (sorted by maxPrice desc)
		expect(results[0].buyOrder.id).toBe(buy1.id)
	})

	it("matches multiple pairs when multiple sellers are available", () => {
		const buy1 = makeBuyOrder({
			buyer: "buyer:alice",
			taskClass: "price_feed",
			maxPrice: 20,
		})
		const buy2 = makeBuyOrder({
			buyer: "buyer:bob",
			taskClass: "price_feed",
			maxPrice: 15,
		})
		const sell1 = makeSellOrder({
			seller: "solver:a",
			supportedTaskClasses: ["price_feed"],
			price: 5,
		})
		const sell2 = makeSellOrder({
			seller: "solver:b",
			supportedTaskClasses: ["price_feed"],
			price: 8,
		})

		book.addBuyOrder(buy1)
		book.addBuyOrder(buy2)
		book.addSellOrder(sell1)
		book.addSellOrder(sell2)

		const results = runMatchingCycle(book)

		expect(results).toHaveLength(2)
		// All 4 orders should be matched
		expect(book.getBuyOrder(buy1.id)!.status).toBe("matched")
		expect(book.getBuyOrder(buy2.id)!.status).toBe("matched")
		expect(book.getSellOrder(sell1.id)!.status).toBe("matched")
		expect(book.getSellOrder(sell2.id)!.status).toBe("matched")
	})

	it("does not match already-matched orders", () => {
		const buy = makeBuyOrder({ status: "matched" as const })
		const sell = makeSellOrder({
			supportedTaskClasses: ["price_feed"],
			price: 5,
		})

		book.addBuyOrder(buy)
		book.addSellOrder(sell)

		const results = runMatchingCycle(book)
		expect(results).toHaveLength(0)
	})

	it("matches seller that supports multiple task classes", () => {
		const buy = makeBuyOrder({ taskClass: "computation", maxPrice: 10 })
		const sell = makeSellOrder({
			supportedTaskClasses: ["price_feed", "computation", "search"],
			price: 5,
		})

		book.addBuyOrder(buy)
		book.addSellOrder(sell)

		const results = runMatchingCycle(book)
		expect(results).toHaveLength(1)
	})
})
