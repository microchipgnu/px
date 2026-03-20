import type { ServerWebSocket } from "bun"
import { existsSync } from "node:fs"
import { join, resolve } from "node:path"
import { Hono } from "hono"
import { cors } from "hono/cors"
import { logger } from "hono/logger"
import { Orderbook } from "./engine/orderbook"
import { runMatchingCycle } from "./engine/matcher"
import { createOrderRoutes } from "./routes/orders"
import { createFulfillmentRoutes } from "./routes/fulfillments"
import { addConnection, removeConnection, broadcast, getConnectionCount } from "./ws/index"
import { RECIPIENT, CURRENCY, TESTNET } from "./mpp"

type WSData = {
	id: string
	taskClasses?: string[]
}

const orderbook = new Orderbook()

// ── HTTP API ──────────────────────────────────────────────────────────────────

const app = new Hono()

app.use("*", cors())
app.use("*", logger())

app.route("/api/orders", createOrderRoutes(orderbook))
app.route("/api/fulfillments", createFulfillmentRoutes(orderbook))

app.get("/api/activity", (c) => {
	const events = [...orderbook.activity.values()]
		.sort((a, b) => b.timestamp - a.timestamp)
		.slice(0, 100)
	return c.json(events)
})

app.get("/api/health", (c) =>
	c.json({
		status: "ok",
		network: process.env.PX_NETWORK ?? "testnet",
		testnet: TESTNET,
		connections: getConnectionCount(),
		buyOrders: orderbook.buyOrders.size,
		sellOrders: orderbook.sellOrders.size,
		settlement: {
			method: "tempo",
			recipient: RECIPIENT,
			currency: CURRENCY,
		},
	}),
)

// ── Static web UI ────────────────────────────────────────────────────────────

const STATIC_DIR = resolve(import.meta.dir, "../public")

// Serve skill guide
app.get("/skill", (c) => c.redirect("/skill.html", 301))

if (existsSync(STATIC_DIR)) {
	app.get("*", async (c) => {
		const filePath = join(STATIC_DIR, c.req.path)

		// Prevent path traversal
		if (!filePath.startsWith(STATIC_DIR)) return c.notFound()

		const file = Bun.file(filePath)
		if ((await file.exists()) && !filePath.endsWith("/")) {
			return new Response(file)
		}

		// SPA fallback
		return new Response(Bun.file(join(STATIC_DIR, "index.html")))
	})
}

// ── Matching engine (runs on interval) ────────────────────────────────────────

/** Broadcast event to WebSocket clients AND persist to activity log */
function emit(event: string, data: unknown): void {
	broadcast(event, data)
	orderbook.logActivity(event, data)
}

const MATCH_INTERVAL = 1000 // 1s

setInterval(() => {
	const expired = orderbook.expireStale()
	for (const id of expired) {
		const order = orderbook.getBuyOrder(id)
		if (order?.status === "open") {
			// Stale match was cleared, order re-opened for matching
			console.log(`[stale] Order ${id} re-opened after stale match`)
			emit("order_placed", { orderId: id, buyer: order.buyer, taskClass: order.taskClass, intent: order.intent, maxPrice: order.maxPrice })
		} else {
			emit("order_expired", { orderId: id })
		}
	}

	const matches = runMatchingCycle(orderbook)
	for (const match of matches) {
		console.log(
			`[match] ${match.buyOrder.buyer} ↔ ${match.sellOrder.seller} | ` +
			`${match.buyOrder.taskClass} | $${match.assignment.agreedPrice}`,
		)

		emit("order_matched", {
			orderId: match.buyOrder.id,
			buyer: match.buyOrder.buyer,
			seller: match.sellOrder.seller,
			taskClass: match.buyOrder.taskClass,
			intent: match.buyOrder.intent,
			agreedPrice: match.assignment.agreedPrice,
		})
	}
}, MATCH_INTERVAL)

// ── Server ────────────────────────────────────────────────────────────────────

const PORT = Number(process.env.PORT ?? 4000)

Bun.serve<WSData>({
	port: PORT,
	fetch(req, server) {
		const url = new URL(req.url)

		if (url.pathname === "/ws" && req.headers.get("upgrade") === "websocket") {
			const success = server.upgrade(req, {
				data: { id: crypto.randomUUID() },
			})
			if (success) return undefined as unknown as Response
			return new Response("WebSocket upgrade failed", { status: 500 })
		}

		return app.fetch(req)
	},
	websocket: {
		open(ws: ServerWebSocket<WSData>) {
			addConnection(ws)
			console.log(`[ws] connected: ${ws.data.id}`)
		},
		message(ws: ServerWebSocket<WSData>, message) {
			try {
				const data = JSON.parse(String(message))
				if (data.type === "subscribe" && Array.isArray(data.taskClasses)) {
					ws.data.taskClasses = data.taskClasses
					ws.send(JSON.stringify({ event: "subscribed", taskClasses: data.taskClasses }))
				}
			} catch {
				// ignore malformed messages
			}
		},
		close(ws: ServerWebSocket<WSData>) {
			removeConnection(ws)
			console.log(`[ws] disconnected: ${ws.data.id}`)
		},
	},
})

console.log(`[coordinator] running on http://localhost:${PORT}`)
console.log(`[coordinator] websocket on ws://localhost:${PORT}/ws`)
console.log(`[coordinator] matching engine: every ${MATCH_INTERVAL}ms`)
console.log(`[mpp] settlement via Tempo ${TESTNET ? "(TESTNET)" : "(MAINNET)"} → ${RECIPIENT}`)
