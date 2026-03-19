import type { Attestation, BuyOrder, Fulfillment, Settlement } from "@payload-exchange/protocol"
import { verify } from "@payload-exchange/attestor"
import type { Orderbook } from "./orderbook"

const NETWORK_FEE_RATE = 0.05 // 5%

// Handles fulfillment submission → attestation. Does NOT settle.
// Settlement happens later when buyer pays via MPP 402.
export function submitFulfillment(
	orderbook: Orderbook,
	fulfillment: Fulfillment,
): { attestation: Attestation } {
	const buyOrder = orderbook.getBuyOrder(fulfillment.orderId)
	if (!buyOrder) {
		throw new Error(`Buy order ${fulfillment.orderId} not found`)
	}

	if (buyOrder.status !== "matched" && buyOrder.status !== "executing") {
		throw new Error(`Buy order ${fulfillment.orderId} is ${buyOrder.status}, expected matched or executing`)
	}

	// Transition to executing then fulfilled
	orderbook.updateBuyOrderStatus(fulfillment.orderId, "executing")
	orderbook.fulfillments.set(fulfillment.orderId, fulfillment)
	orderbook.updateBuyOrderStatus(fulfillment.orderId, "fulfilled")

	// Run attestation
	const attestation = verify(fulfillment, buyOrder)
	orderbook.attestations.set(fulfillment.orderId, attestation)

	if (attestation.success) {
		orderbook.updateBuyOrderStatus(fulfillment.orderId, "attested")
	} else {
		orderbook.updateBuyOrderStatus(fulfillment.orderId, "disputed")
	}

	return { attestation }
}

// Called after buyer pays via MPP. Creates the settlement record.
export function settleOrder(
	orderbook: Orderbook,
	orderId: string,
	txHash?: string,
): Settlement {
	const buyOrder = orderbook.getBuyOrder(orderId)
	if (!buyOrder) throw new Error(`Buy order ${orderId} not found`)
	if (buyOrder.status !== "attested") throw new Error(`Order ${orderId} is ${buyOrder.status}, expected attested`)

	const assignment = orderbook.assignments.get(orderId)
	const agreedPrice = assignment?.agreedPrice ?? buyOrder.maxPrice
	const networkFee = Number.parseFloat((agreedPrice * NETWORK_FEE_RATE).toFixed(4))
	const sellerReceived = Number.parseFloat((agreedPrice - networkFee).toFixed(4))

	const settlement: Settlement = {
		id: crypto.randomUUID(),
		orderId,
		buyerPaid: agreedPrice,
		sellerReceived,
		networkFee,
		currency: buyOrder.currency,
		method: "tempo",
		timestamp: Math.floor(Date.now() / 1000),
		txHash: txHash ?? `tx:${crypto.randomUUID().slice(0, 12)}`,
	}

	orderbook.settlements.set(orderId, settlement)
	orderbook.updateBuyOrderStatus(orderId, "settled")

	return settlement
}

export function getOrderResult(orderbook: Orderbook, orderId: string) {
	const buyOrder = orderbook.getBuyOrder(orderId)
	if (!buyOrder) return undefined

	return {
		order: buyOrder,
		assignment: orderbook.assignments.get(orderId),
		fulfillment: orderbook.fulfillments.get(orderId),
		attestation: orderbook.attestations.get(orderId),
		settlement: orderbook.settlements.get(orderId),
	}
}
