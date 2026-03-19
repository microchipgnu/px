import type {
	Attestation,
	BuyOrder,
	Fulfillment,
	OrderStatus,
	SellOrder,
	Settlement,
} from "@payload-exchange/protocol"
import { openDatabase, SQLiteMap } from "../db"

export type Assignment = {
	id: string
	orderId: string
	sellerId: string
	sellerOrderId: string
	agreedPrice: number
	deadline: number
	createdAt: number
}

export type ActivityRecord = {
	id: string
	event: string
	data: unknown
	timestamp: number
}

export class Orderbook {
	buyOrders: SQLiteMap<BuyOrder>
	sellOrders: SQLiteMap<SellOrder>
	assignments: SQLiteMap<Assignment> // keyed by buy order ID
	fulfillments: SQLiteMap<Fulfillment> // keyed by buy order ID
	attestations: SQLiteMap<Attestation> // keyed by buy order ID
	settlements: SQLiteMap<Settlement> // keyed by buy order ID
	activity: SQLiteMap<ActivityRecord>

	constructor() {
		const db = openDatabase()
		this.buyOrders = new SQLiteMap<BuyOrder>(db, "buy_orders")
		this.sellOrders = new SQLiteMap<SellOrder>(db, "sell_orders")
		this.assignments = new SQLiteMap<Assignment>(db, "assignments")
		this.fulfillments = new SQLiteMap<Fulfillment>(db, "fulfillments")
		this.attestations = new SQLiteMap<Attestation>(db, "attestations")
		this.settlements = new SQLiteMap<Settlement>(db, "settlements")
		this.activity = new SQLiteMap<ActivityRecord>(db, "activity")
	}

	logActivity(event: string, data: unknown): void {
		const record: ActivityRecord = {
			id: crypto.randomUUID(),
			event,
			data,
			timestamp: Date.now(),
		}
		this.activity.set(record.id, record)
	}

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
