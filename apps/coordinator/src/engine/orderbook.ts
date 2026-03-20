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

	snapshot(opts?: { pipelineOffset?: number; pipelineLimit?: number }) {
		const now = Math.floor(Date.now() / 1000)
		const allAssignments = [...this.assignments.values()]

		// Orderbook: only open orders (waiting for a match)
		const buyOrders = this.getOpenBuyOrders()
		const sellOrders = this.getOpenSellOrders()

		// Pipeline: all assignments enriched with order data + timestamps
		const pipeline = allAssignments.map((a) => {
			const fulfillment = this.fulfillments.get(a.orderId)
			const attestation = this.attestations.get(a.orderId)
			const settlement = this.settlements.get(a.orderId)
			const buyOrder = this.buyOrders.get(a.orderId)
			const sellOrder = this.sellOrders.get(a.sellerOrderId)
			return {
				...a,
				buyOrder: buyOrder ?? null,
				sellOrder: sellOrder ?? null,
				fulfilledAt: fulfillment?.timestamp,
				attestedAt: attestation?.timestamp,
				settledAt: settlement?.timestamp,
				result: fulfillment?.result ?? null,
				proof: fulfillment?.proof ?? null,
				settlement: settlement ?? null,
				status: buyOrder?.status ?? "unknown",
			}
		}).sort((a, b) => b.createdAt - a.createdAt)

		const offset = opts?.pipelineOffset ?? 0
		const limit = opts?.pipelineLimit ?? 50
		const pipelinePage = pipeline.slice(offset, offset + limit)

		return {
			buyOrders,
			sellOrders,
			assignments: allAssignments,
			pipeline: pipelinePage,
			pipelineTotal: pipeline.length,
		}
	}

	// Expire overdue buy orders + unstick stale matches
	expireStale(): string[] {
		const now = Math.floor(Date.now() / 1000)
		const expired: string[] = []
		const MATCH_TIMEOUT = 120 // 2 minutes to fulfill after match

		for (const [id, order] of this.buyOrders) {
			// Expire open orders past their expiry time
			if (order.status === "open" && order.expiry <= now) {
				this.buyOrders.set(id, { ...order, status: "expired" })
				expired.push(id)
				continue
			}

			// Unstick matched orders where solver never fulfilled
			if ((order.status === "matched" || order.status === "executing") && order.expiry > now) {
				const assignment = this.assignments.get(id)
				if (assignment && (now - assignment.createdAt) > MATCH_TIMEOUT) {
					// Remove stale assignment, reopen the order for re-matching
					this.assignments.delete(id)
					this.buyOrders.set(id, { ...order, status: "open" })
					expired.push(id) // signal to emit event
				}
			}

			// Expire matched/executing orders past their expiry
			if ((order.status === "matched" || order.status === "executing") && order.expiry <= now) {
				this.assignments.delete(id)
				this.buyOrders.set(id, { ...order, status: "expired" })
				expired.push(id)
			}
		}
		return expired
	}
}
