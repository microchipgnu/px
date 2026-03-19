import type { BuyOrder, SellOrder } from "@payload-exchange/protocol"
import type { Assignment, Orderbook } from "./orderbook"

export type MatchResult = {
	buyOrder: BuyOrder
	sellOrder: SellOrder
	assignment: Assignment
}

// Direct matching: for each open buy order, find the best-priced compatible seller.
export function runMatchingCycle(orderbook: Orderbook): MatchResult[] {
	const openBuys = orderbook.getOpenBuyOrders()
	const openSells = orderbook.getOpenSellOrders()
	const results: MatchResult[] = []

	// Track which sell orders we've already matched this cycle
	const matchedSellIds = new Set<string>()

	// Sort buys by price descending (highest willingness to pay first)
	const sortedBuys = [...openBuys].sort((a, b) => b.maxPrice - a.maxPrice)

	for (const buyOrder of sortedBuys) {
		// Find compatible sellers
		const compatible = openSells.filter(
			(s) =>
				!matchedSellIds.has(s.id) &&
				s.supportedTaskClasses.includes(buyOrder.taskClass) &&
				s.price <= buyOrder.maxPrice,
		)

		if (compatible.length === 0) continue

		// Pick the cheapest compatible seller (best price for buyer)
		const bestSeller = compatible.reduce((best, s) => (s.price < best.price ? s : best))

		// Agreed price: midpoint between seller's ask and buyer's max
		const agreedPrice = bestSeller.price + (buyOrder.maxPrice - bestSeller.price) * 0.5
		const roundedPrice = Number.parseFloat(agreedPrice.toFixed(4))

		const assignment: Assignment = {
			id: crypto.randomUUID(),
			orderId: buyOrder.id,
			sellerId: bestSeller.seller,
			sellerOrderId: bestSeller.id,
			agreedPrice: roundedPrice,
			deadline: buyOrder.expiry,
			createdAt: Math.floor(Date.now() / 1000),
		}

		// Update state
		orderbook.updateBuyOrderStatus(buyOrder.id, "matched")
		orderbook.updateSellOrderStatus(bestSeller.id, "matched")
		orderbook.assignments.set(buyOrder.id, assignment)
		matchedSellIds.add(bestSeller.id)

		results.push({
			buyOrder: orderbook.getBuyOrder(buyOrder.id)!,
			sellOrder: orderbook.getSellOrder(bestSeller.id)!,
			assignment,
		})
	}

	return results
}
