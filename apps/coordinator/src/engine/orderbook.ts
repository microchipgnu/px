import type {
	Attestation,
	BuyOrder,
	Fulfillment,
	OrderStatus,
	SellOrder,
	Settlement,
} from "@payload-exchange/protocol"

export type Assignment = {
	id: string
	orderId: string
	sellerId: string
	sellerOrderId: string
	agreedPrice: number
	deadline: number
	createdAt: number
}

export class Orderbook {
	buyOrders = new Map<string, BuyOrder>()
	sellOrders = new Map<string, SellOrder>()
	assignments = new Map<string, Assignment>() // keyed by buy order ID
	fulfillments = new Map<string, Fulfillment>() // keyed by buy order ID
	attestations = new Map<string, Attestation>() // keyed by buy order ID
	settlements = new Map<string, Settlement>() // keyed by buy order ID

	addBuyOrder(order: BuyOrder): void {
		this.buyOrders.set(order.id, order)
	}

	addSellOrder(order: SellOrder): void {
		this.sellOrders.set(order.id, order)
	}

	getBuyOrder(id: string): BuyOrder | undefined {
		return this.buyOrders.get(id)
	}

	getSellOrder(id: string): SellOrder | undefined {
		return this.sellOrders.get(id)
	}

	updateBuyOrderStatus(id: string, status: OrderStatus): void {
		const order = this.buyOrders.get(id)
		if (order) {
			this.buyOrders.set(id, { ...order, status })
		}
	}

	updateSellOrderStatus(id: string, status: OrderStatus): void {
		const order = this.sellOrders.get(id)
		if (order) {
			this.sellOrders.set(id, { ...order, status })
		}
	}

	getOpenBuyOrders(): BuyOrder[] {
		const now = Math.floor(Date.now() / 1000)
		return [...this.buyOrders.values()].filter(
			(o) => o.status === "open" && o.expiry > now,
		)
	}

	getOpenSellOrders(): SellOrder[] {
		return [...this.sellOrders.values()].filter((o) => o.status === "open")
	}

	snapshot() {
		return {
			buyOrders: [...this.buyOrders.values()],
			sellOrders: [...this.sellOrders.values()],
			assignments: [...this.assignments.values()],
		}
	}

	// Expire overdue buy orders
	expireStale(): string[] {
		const now = Math.floor(Date.now() / 1000)
		const expired: string[] = []
		for (const [id, order] of this.buyOrders) {
			if (order.status === "open" && order.expiry <= now) {
				this.buyOrders.set(id, { ...order, status: "expired" })
				expired.push(id)
			}
		}
		return expired
	}
}
