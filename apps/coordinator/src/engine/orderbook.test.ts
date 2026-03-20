import { describe, it, expect, beforeEach } from "bun:test"
import { Orderbook } from "./orderbook"
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

describe("Orderbook", () => {
	let book: Orderbook

	beforeEach(() => {
		book = new Orderbook()
	})

	// ─── addBuyOrder / getBuyOrder ────────────────────────────────────

	describe("addBuyOrder", () => {
		it("stores and retrieves a buy order by id", () => {
			const order = makeBuyOrder()
			book.addBuyOrder(order)

			const retrieved = book.getBuyOrder(order.id)
			expect(retrieved).toBeDefined()
			expect(retrieved!.id).toBe(order.id)
			expect(retrieved!.buyer).toBe("buyer:alice")
			expect(retrieved!.taskClass).toBe("price_feed")
		})

		it("returns undefined for non-existent id", () => {
			expect(book.getBuyOrder("non-existent")).toBeUndefined()
		})

		it("stores multiple buy orders independently", () => {
			const order1 = makeBuyOrder({ buyer: "buyer:alice" })
			const order2 = makeBuyOrder({ buyer: "buyer:bob" })
			book.addBuyOrder(order1)
			book.addBuyOrder(order2)

			expect(book.getBuyOrder(order1.id)!.buyer).toBe("buyer:alice")
			expect(book.getBuyOrder(order2.id)!.buyer).toBe("buyer:bob")
		})
	})

	// ─── addSellOrder / getSellOrder ─────────────────────────────────

	describe("addSellOrder", () => {
		it("stores and retrieves a sell order by id", () => {
			const order = makeSellOrder()
			book.addSellOrder(order)

			const retrieved = book.getSellOrder(order.id)
			expect(retrieved).toBeDefined()
			expect(retrieved!.id).toBe(order.id)
			expect(retrieved!.seller).toBe("solver:bob")
		})

		it("returns undefined for non-existent id", () => {
			expect(book.getSellOrder("non-existent")).toBeUndefined()
		})
	})

	// ─── getOpenBuyOrders ────────────────────────────────────────────

	describe("getOpenBuyOrders", () => {
		it("returns only orders with status=open", () => {
			const open1 = makeBuyOrder({ status: "open" })
			const matched = makeBuyOrder({ status: "matched" })
			const open2 = makeBuyOrder({ status: "open" })

			book.addBuyOrder(open1)
			book.addBuyOrder(matched)
			book.addBuyOrder(open2)

			const openOrders = book.getOpenBuyOrders()
			expect(openOrders).toHaveLength(2)
			expect(openOrders.map((o) => o.id)).toContain(open1.id)
			expect(openOrders.map((o) => o.id)).toContain(open2.id)
		})

		it("excludes expired orders (expiry in the past)", () => {
			const expired = makeBuyOrder({ status: "open", expiry: now - 100 })
			const valid = makeBuyOrder({ status: "open", expiry: now + 3600 })

			book.addBuyOrder(expired)
			book.addBuyOrder(valid)

			const openOrders = book.getOpenBuyOrders()
			expect(openOrders).toHaveLength(1)
			expect(openOrders[0].id).toBe(valid.id)
		})

		it("returns empty array when no open orders exist", () => {
			book.addBuyOrder(makeBuyOrder({ status: "matched" }))
			expect(book.getOpenBuyOrders()).toHaveLength(0)
		})

		it("returns empty array when orderbook is empty", () => {
			expect(book.getOpenBuyOrders()).toHaveLength(0)
		})
	})

	// ─── getOpenSellOrders ───────────────────────────────────────────

	describe("getOpenSellOrders", () => {
		it("returns only orders with status=open", () => {
			const open = makeSellOrder({ status: "open" })
			const matched = makeSellOrder({ status: "matched" })

			book.addSellOrder(open)
			book.addSellOrder(matched)

			const openOrders = book.getOpenSellOrders()
			expect(openOrders).toHaveLength(1)
			expect(openOrders[0].id).toBe(open.id)
		})

		it("returns empty array when no open sell orders exist", () => {
			expect(book.getOpenSellOrders()).toHaveLength(0)
		})

		it("returns all open sell orders", () => {
			const o1 = makeSellOrder({ seller: "solver:a" })
			const o2 = makeSellOrder({ seller: "solver:b" })
			const o3 = makeSellOrder({ seller: "solver:c" })

			book.addSellOrder(o1)
			book.addSellOrder(o2)
			book.addSellOrder(o3)

			expect(book.getOpenSellOrders()).toHaveLength(3)
		})
	})

	// ─── updateBuyOrderStatus ────────────────────────────────────────

	describe("updateBuyOrderStatus", () => {
		it("transitions order status correctly", () => {
			const order = makeBuyOrder({ status: "open" })
			book.addBuyOrder(order)

			book.updateBuyOrderStatus(order.id, "matched")
			expect(book.getBuyOrder(order.id)!.status).toBe("matched")

			book.updateBuyOrderStatus(order.id, "executing")
			expect(book.getBuyOrder(order.id)!.status).toBe("executing")

			book.updateBuyOrderStatus(order.id, "fulfilled")
			expect(book.getBuyOrder(order.id)!.status).toBe("fulfilled")
		})

		it("does nothing for non-existent order", () => {
			// Should not throw
			book.updateBuyOrderStatus("non-existent", "matched")
			expect(book.getBuyOrder("non-existent")).toBeUndefined()
		})

		it("preserves other order fields when updating status", () => {
			const order = makeBuyOrder({
				buyer: "buyer:alice",
				maxPrice: 42,
				intent: "test intent",
			})
			book.addBuyOrder(order)
			book.updateBuyOrderStatus(order.id, "matched")

			const updated = book.getBuyOrder(order.id)!
			expect(updated.buyer).toBe("buyer:alice")
			expect(updated.maxPrice).toBe(42)
			expect(updated.intent).toBe("test intent")
			expect(updated.status).toBe("matched")
		})
	})

	// ─── updateSellOrderStatus ───────────────────────────────────────

	describe("updateSellOrderStatus", () => {
		it("transitions sell order status correctly", () => {
			const order = makeSellOrder({ status: "open" })
			book.addSellOrder(order)

			book.updateSellOrderStatus(order.id, "matched")
			expect(book.getSellOrder(order.id)!.status).toBe("matched")
		})

		it("does nothing for non-existent sell order", () => {
			book.updateSellOrderStatus("non-existent", "matched")
			expect(book.getSellOrder("non-existent")).toBeUndefined()
		})
	})

	// ─── expireStale ─────────────────────────────────────────────────

	describe("expireStale", () => {
		it("expires orders past their expiry time", () => {
			const stale = makeBuyOrder({ status: "open", expiry: now - 100 })
			const fresh = makeBuyOrder({ status: "open", expiry: now + 3600 })

			book.addBuyOrder(stale)
			book.addBuyOrder(fresh)

			const expired = book.expireStale()

			expect(expired).toHaveLength(1)
			expect(expired[0]).toBe(stale.id)
			expect(book.getBuyOrder(stale.id)!.status).toBe("expired")
			expect(book.getBuyOrder(fresh.id)!.status).toBe("open")
		})

		it("expires matched orders past their expiry", () => {
			const matchedPastExpiry = makeBuyOrder({ status: "matched", expiry: now - 100 })
			book.addBuyOrder(matchedPastExpiry)

			const expired = book.expireStale()
			expect(expired).toHaveLength(1)
			expect(book.getBuyOrder(matchedPastExpiry.id)!.status).toBe("expired")
		})

		it("re-opens stale matched orders within expiry after 2min timeout", () => {
			const staleMatch = makeBuyOrder({ status: "matched", expiry: now + 3600 })
			book.addBuyOrder(staleMatch)
			// Assignment created 3 minutes ago (past the 2min timeout)
			book.assignments.set(staleMatch.id, {
				id: crypto.randomUUID(),
				orderId: staleMatch.id,
				sellerId: "seller1",
				sellerOrderId: "sell1",
				agreedPrice: 0.05,
				deadline: now + 3600,
				createdAt: now - 180,
			})

			const expired = book.expireStale()
			expect(expired).toHaveLength(1)
			expect(book.getBuyOrder(staleMatch.id)!.status).toBe("open")
			expect(book.assignments.get(staleMatch.id)).toBeUndefined()
		})

		it("returns empty array when nothing to expire", () => {
			const fresh = makeBuyOrder({ status: "open", expiry: now + 3600 })
			book.addBuyOrder(fresh)

			const expired = book.expireStale()
			expect(expired).toHaveLength(0)
		})

		it("returns empty array on empty orderbook", () => {
			expect(book.expireStale()).toHaveLength(0)
		})

		it("expires multiple stale orders at once", () => {
			const stale1 = makeBuyOrder({ status: "open", expiry: now - 100 })
			const stale2 = makeBuyOrder({ status: "open", expiry: now - 200 })
			const fresh = makeBuyOrder({ status: "open", expiry: now + 3600 })

			book.addBuyOrder(stale1)
			book.addBuyOrder(stale2)
			book.addBuyOrder(fresh)

			const expired = book.expireStale()
			expect(expired).toHaveLength(2)
			expect(expired).toContain(stale1.id)
			expect(expired).toContain(stale2.id)
		})
	})

	// ─── snapshot ────────────────────────────────────────────────────

	describe("snapshot", () => {
		it("returns all buy orders, sell orders, and assignments", () => {
			const buy = makeBuyOrder()
			const sell = makeSellOrder()

			book.addBuyOrder(buy)
			book.addSellOrder(sell)

			book.assignments.set(buy.id, {
				id: crypto.randomUUID(),
				orderId: buy.id,
				sellerId: sell.seller,
				sellerOrderId: sell.id,
				agreedPrice: 7.5,
				deadline: buy.expiry,
				createdAt: now,
			})

			const snap = book.snapshot()
			expect(snap.buyOrders).toHaveLength(1)
			expect(snap.sellOrders).toHaveLength(1)
			expect(snap.assignments).toHaveLength(1)

			expect(snap.buyOrders[0].id).toBe(buy.id)
			expect(snap.sellOrders[0].id).toBe(sell.id)
			expect(snap.assignments[0].orderId).toBe(buy.id)
		})

		it("returns empty arrays on empty orderbook", () => {
			const snap = book.snapshot()
			expect(snap.buyOrders).toHaveLength(0)
			expect(snap.sellOrders).toHaveLength(0)
			expect(snap.assignments).toHaveLength(0)
		})

		it("returns only open orders in snapshot buyOrders", () => {
			book.addBuyOrder(makeBuyOrder({ status: "open" }))
			book.addBuyOrder(makeBuyOrder({ status: "matched" }))
			book.addBuyOrder(makeBuyOrder({ status: "settled" }))

			const snap = book.snapshot()
			// only open orders appear in buyOrders
			expect(snap.buyOrders).toHaveLength(1)
			expect(snap.buyOrders[0].status).toBe("open")
		})
	})
})
