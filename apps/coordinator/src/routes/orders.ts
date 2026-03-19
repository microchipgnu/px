import { Hono } from "hono"
import { BuyOrder, SellOrder } from "@payload-exchange/protocol"
import type { Orderbook } from "../engine/orderbook"
import { getOrderResult, settleOrder } from "../engine/lifecycle"
import { broadcast, broadcastToSolvers } from "../ws/index"
import { mppx } from "../mpp"

export function createOrderRoutes(orderbook: Orderbook) {
	const app = new Hono()

	// Submit a buy order (intent)
	app.post("/buy", async (c) => {
		const body = await c.req.json()

		const raw = {
			id: crypto.randomUUID(),
			status: "open" as const,
			createdAt: Math.floor(Date.now() / 1000),
			currency: "USDC",
			...body,
		}

		const parsed = BuyOrder.safeParse(raw)
		if (!parsed.success) {
			return c.json({ error: "Invalid buy order", details: parsed.error.flatten() }, 400)
		}

		const order = parsed.data
		orderbook.addBuyOrder(order)

		broadcast("order_placed", {
			orderId: order.id,
			buyer: order.buyer,
			taskClass: order.taskClass,
			intent: order.intent,
			maxPrice: order.maxPrice,
		})

		broadcastToSolvers(order.taskClass, "new_intent", {
			orderId: order.id,
			taskClass: order.taskClass,
			intent: order.intent,
			constraints: order.constraints,
			maxPrice: order.maxPrice,
			expiry: order.expiry,
			proofRequirements: order.proofRequirements,
		})

		return c.json({ id: order.id, status: order.status }, 201)
	})

	// Submit a sell order (register solver)
	app.post("/sell", async (c) => {
		const body = await c.req.json()

		const raw = {
			id: crypto.randomUUID(),
			status: "open" as const,
			createdAt: Math.floor(Date.now() / 1000),
			currency: "USDC",
			reputation: {},
			...body,
		}

		const parsed = SellOrder.safeParse(raw)
		if (!parsed.success) {
			return c.json({ error: "Invalid sell order", details: parsed.error.flatten() }, 400)
		}

		const order = parsed.data
		orderbook.addSellOrder(order)

		broadcast("solver_joined", {
			sellerId: order.id,
			seller: order.seller,
			taskClasses: order.supportedTaskClasses,
			price: order.price,
		})

		return c.json({ id: order.id, status: order.status }, 201)
	})

	// Get order by ID
	app.get("/:id", (c) => {
		const id = c.req.param("id")
		const buyOrder = orderbook.getBuyOrder(id)
		if (buyOrder) return c.json(buyOrder)

		const sellOrder = orderbook.getSellOrder(id)
		if (sellOrder) return c.json(sellOrder)

		return c.json({ error: "Order not found" }, 404)
	})

	// Get order status
	app.get("/:id/status", (c) => {
		const id = c.req.param("id")
		const buyOrder = orderbook.getBuyOrder(id)
		if (buyOrder) return c.json({ id, status: buyOrder.status })

		const sellOrder = orderbook.getSellOrder(id)
		if (sellOrder) return c.json({ id, status: sellOrder.status })

		return c.json({ error: "Order not found" }, 404)
	})

	// Get fulfillment result — 402-gated via MPP
	app.get("/:id/result", async (c) => {
		const id = c.req.param("id")
		const result = getOrderResult(orderbook, id)

		if (!result) return c.json({ error: "Order not found" }, 404)
		if (!result.fulfillment) return c.json({ error: "Not yet fulfilled", status: result.order.status }, 202)
		if (!result.attestation) return c.json({ error: "Not yet attested", status: result.order.status }, 202)
		if (!result.attestation.success) {
			return c.json({
				error: "Attestation failed",
				status: result.order.status,
				reason: result.attestation.reason,
			}, 422)
		}

		// Already settled — return result directly (buyer already paid)
		if (result.settlement) {
			return c.json({
				orderId: id,
				status: result.order.status,
				fulfillment: result.fulfillment,
				attestation: result.attestation,
				settlement: result.settlement,
			})
		}

		// Not yet settled — gate with MPP 402 challenge on Tempo
		const assignment = orderbook.assignments.get(id)
		const amount = String(assignment?.agreedPrice ?? result.order.maxPrice)

		const paymentResult = await mppx.charge({
			amount,
			description: `payload.exchange: ${result.order.intent}`,
		})(c.req.raw)

		if (paymentResult.status === 402) {
			return paymentResult.challenge
		}

		// Payment verified on Tempo — settle the order
		const settlement = settleOrder(orderbook, id)

		broadcast("settlement_complete", {
			orderId: id,
			buyerPaid: settlement.buyerPaid,
			sellerReceived: settlement.sellerReceived,
			networkFee: settlement.networkFee,
			txHash: settlement.txHash,
		})

		return paymentResult.withReceipt(
			Response.json({
				orderId: id,
				status: "settled",
				fulfillment: result.fulfillment,
				attestation: result.attestation,
				settlement,
			}),
		)
	})

	// Get full orderbook snapshot
	app.get("/", (c) => {
		return c.json(orderbook.snapshot())
	})

	return app
}
