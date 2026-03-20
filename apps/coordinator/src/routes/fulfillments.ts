import { Hono } from "hono"
import { Fulfillment } from "@payload-exchange/protocol"
import type { Orderbook } from "../engine/orderbook"
import { submitFulfillment } from "../engine/lifecycle"
import { broadcast } from "../ws/index"

export function createFulfillmentRoutes(orderbook: Orderbook) {
	const app = new Hono()

	function emit(event: string, data: unknown): void {
		broadcast(event, data)
		orderbook.logActivity(event, data)
	}

	app.post("/", async (c) => {
		const body = await c.req.json()

		const raw = {
			id: crypto.randomUUID(),
			timestamp: Math.floor(Date.now() / 1000),
			...body,
		}

		const parsed = Fulfillment.safeParse(raw)
		if (!parsed.success) {
			return c.json({ error: "Invalid fulfillment", details: parsed.error.flatten() }, 400)
		}

		const fulfillment = parsed.data

		// Check the order exists
		const buyOrder = orderbook.getBuyOrder(fulfillment.orderId)
		if (!buyOrder) {
			return c.json({ error: `Order ${fulfillment.orderId} not found` }, 404)
		}

		// Check the solver is the assigned one
		const assignment = orderbook.assignments.get(fulfillment.orderId)
		if (!assignment) {
			return c.json({ error: "No assignment for this order" }, 400)
		}
		if (assignment.sellerId !== fulfillment.sellerId) {
			return c.json({ error: "Solver does not match assignment" }, 403)
		}

		try {
			emit("execution_started", {
				orderId: fulfillment.orderId,
				sellerId: fulfillment.sellerId,
				taskClass: buyOrder.taskClass,
				intent: buyOrder.intent,
			})

			const { attestation } = submitFulfillment(orderbook, fulfillment)

			emit("fulfillment_submitted", {
				orderId: fulfillment.orderId,
				sellerId: fulfillment.sellerId,
				taskClass: buyOrder.taskClass,
			})

			if (attestation.success) {
				emit("attestation_passed", {
					orderId: fulfillment.orderId,
					checks: attestation.checks,
				})
			} else {
				emit("attestation_failed", {
					orderId: fulfillment.orderId,
					reason: attestation.reason,
					checks: attestation.checks,
				})
			}

			return c.json({
				orderId: fulfillment.orderId,
				attestation: {
					success: attestation.success,
					checks: attestation.checks,
					reason: attestation.reason,
				},
				// Settlement happens when buyer pays via GET /orders/:id/result (402 flow)
				nextStep: attestation.success
					? `GET /api/orders/${fulfillment.orderId}/result to trigger payment`
					: "disputed — attestation failed",
			}, attestation.success ? 200 : 422)
		} catch (err) {
			const message = err instanceof Error ? err.message : "Unknown error"
			return c.json({ error: message }, 400)
		}
	})

	return app
}
