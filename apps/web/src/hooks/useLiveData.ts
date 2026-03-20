import type {
	ActivityEvent,
	ActivityEventType,
	BuyOrder,
	SellOrder,
} from "@payload-exchange/protocol"
import { useCallback, useEffect, useRef, useState } from "react"
import type { MatchedPair, MatchTick } from "./useSimulation"

const MAX_ACTIVITY = 50
const POLL_INTERVAL = 3000

function httpUrl(baseUrl: string | undefined, path: string): string {
	if (!baseUrl || isSameOrigin(baseUrl)) return path
	return `${baseUrl.replace(/\/$/, "")}${path}`
}

function wsUrl(baseUrl?: string): string {
	if (!baseUrl || isSameOrigin(baseUrl)) {
		const proto = window.location.protocol === "https:" ? "wss:" : "ws:"
		return `${proto}//${window.location.host}/ws`
	}
	const url = new URL(baseUrl)
	const proto = url.protocol === "https:" ? "wss:" : "ws:"
	return `${proto}//${url.host}/ws`
}

function isSameOrigin(baseUrl: string): boolean {
	try {
		const url = new URL(baseUrl)
		return url.host === window.location.host
	} catch {
		return true
	}
}

function makeEvent(
	type: ActivityEventType,
	fields: Omit<ActivityEvent, "id" | "type" | "timestamp">,
): ActivityEvent {
	return { id: crypto.randomUUID(), type, timestamp: Math.floor(Date.now() / 1000), ...fields }
}

type Assignment = {
	id: string
	orderId: string
	sellerId: string
	sellerOrderId: string
	agreedPrice: number
	deadline: number
	createdAt: number
}

type PipelineEntry = Assignment & {
	fulfilledAt?: number
	attestedAt?: number
	settledAt?: number
	status: string
}

export function useLiveData(enabled: boolean, baseUrl?: string) {
	const [buyOrders, setBuyOrders] = useState<BuyOrder[]>([])
	const [sellOrders, setSellOrders] = useState<SellOrder[]>([])
	const [activity, setActivity] = useState<ActivityEvent[]>([])
	const [matchedPairs, setMatchedPairs] = useState<MatchedPair[]>([])
	const [totalMatched, setTotalMatched] = useState(0)
	const [totalVolume, setTotalVolume] = useState(0)
	const [matchHistory, setMatchHistory] = useState<MatchTick[]>([])
	const wsRef = useRef<WebSocket | null>(null)

	const pushActivity = useCallback((event: ActivityEvent) => {
		setActivity((prev) => [event, ...prev].slice(0, MAX_ACTIVITY))
	}, [])

	// Load persisted activity history on mount
	useEffect(() => {
		if (!enabled) return

		const loadHistory = async () => {
			try {
				const res = await fetch(httpUrl(baseUrl, "/api/activity?limit=50"))
				if (!res.ok) return
				const body = await res.json()
				// Support both old (array) and new ({ events, total }) formats
				const events = (Array.isArray(body) ? body : body.events ?? []) as Array<{
					id: string
					event: string
					data: Record<string, unknown>
					timestamp: number
				}>

				// Seed activity feed
				const mapped: ActivityEvent[] = events.map((e) => ({
					id: e.id,
					type: e.event as ActivityEventType,
					timestamp: Math.floor(e.timestamp / 1000),
					orderId: e.data.orderId as string | undefined,
					buyer: e.data.buyer as string | undefined,
					seller: e.data.seller as string | undefined,
					taskClass: e.data.taskClass as ActivityEvent["taskClass"],
					intent: e.data.intent as string | undefined,
					price: (e.data.agreedPrice ?? e.data.maxPrice ?? e.data.buyerPaid) as number | undefined,
					txHash: e.data.txHash as string | undefined,
				}))
				setActivity(mapped.slice(0, MAX_ACTIVITY))

				// Derive counters from history
				const matches = events.filter((e) => e.event === "order_matched")
				setTotalMatched(matches.length)
				setTotalVolume(
					matches.reduce((sum, e) => sum + ((e.data.agreedPrice as number) ?? 0), 0),
				)
				setMatchHistory(
					matches
						.map((e) => ({ t: e.timestamp, price: (e.data.agreedPrice as number) ?? 0 }))
						.slice(-120),
				)
			} catch {
				// coordinator unreachable
			}
		}

		loadHistory()
	}, [enabled, baseUrl])

	// Poll orderbook snapshot
	useEffect(() => {
		if (!enabled) return

		const poll = async () => {
			try {
				const res = await fetch(httpUrl(baseUrl, "/api/orders"))
				if (!res.ok) return
				const data = await res.json()
				setBuyOrders(data.buyOrders ?? [])
				setSellOrders(data.sellOrders ?? [])

				// Use pipeline data (enriched with order data + timestamps)
				type PipelineItem = PipelineEntry & { buyOrder?: BuyOrder | null; sellOrder?: SellOrder | null }
				const pipelineItems: PipelineItem[] = data.pipeline ?? []

				// Fall back to assignment-based lookup if pipeline not available
				const allBuyMap = new Map<string, BuyOrder>()
				for (const o of data.buyOrders ?? []) allBuyMap.set(o.id, o)
				const allSellMap = new Map<string, SellOrder>()
				for (const o of data.sellOrders ?? []) allSellMap.set(o.id, o)

				const source = pipelineItems.length > 0 ? pipelineItems : (data.assignments ?? []) as PipelineItem[]

				const pairs: MatchedPair[] = source
					.map((p) => {
						const buyOrder = p.buyOrder ?? allBuyMap.get(p.orderId)
						const sellOrder = p.sellOrder ?? allSellMap.get(p.sellerOrderId)
						if (!buyOrder || !sellOrder) return null
						const status = p.status ?? buyOrder.status
						const stage =
							status === "settled" ? "settled"
								: status === "attested" ? "attested"
								: status === "fulfilled" ? "fulfilled"
								: status === "executing" ? "executing"
								: "matched"
						const settlement = (p as Record<string, unknown>).settlement as Record<string, unknown> | null | undefined
						return {
							buyOrder,
							sellOrder,
							stage,
							matchedAt: p.createdAt * 1000,
							fulfilledAt: p.fulfilledAt ? p.fulfilledAt * 1000 : undefined,
							attestedAt: p.attestedAt ? p.attestedAt * 1000 : undefined,
							settledAt: p.settledAt ? p.settledAt * 1000 : undefined,
							result: (p as Record<string, unknown>).result ?? undefined,
							proof: (p as Record<string, unknown>).proof ?? undefined,
							txHash: settlement?.txHash as string | undefined,
						} satisfies MatchedPair
					})
					.filter(Boolean) as MatchedPair[]

				// Filter out stalled non-settled orders (stuck for >10 min)
				const STALE_MS = 10 * 60 * 1000
				const now = Date.now()
				const fresh = pairs.filter((p) => {
					if (p.stage === "settled") return true
					return now - p.matchedAt < STALE_MS
				})

				setMatchedPairs(fresh.slice(0, 20))
			} catch {
				// coordinator unreachable
			}
		}

		poll()
		const interval = setInterval(poll, POLL_INTERVAL)
		return () => clearInterval(interval)
	}, [enabled, baseUrl])

	// WebSocket for real-time activity events
	useEffect(() => {
		if (!enabled) return

		let reconnectTimer: ReturnType<typeof setTimeout>

		const connect = () => {
			const ws = new WebSocket(wsUrl(baseUrl))
			wsRef.current = ws

			ws.onmessage = (e) => {
				try {
					const msg = JSON.parse(e.data)
					const { event, data } = msg

					pushActivity(
						makeEvent(event as ActivityEventType, {
							orderId: data.orderId,
							buyer: data.buyer,
							seller: data.seller,
							taskClass: data.taskClass,
							intent: data.intent,
							price: data.agreedPrice ?? data.maxPrice ?? data.price ?? data.buyerPaid,
							detail: data.detail,
							txHash: data.txHash,
						}),
					)

					if (event === "order_matched") {
						setTotalMatched((n) => n + 1)
						const price = data.agreedPrice ?? 0
						setTotalVolume((v) => v + price)
						setMatchHistory((prev) => [...prev, { t: Date.now(), price }].slice(-120))
					}
				} catch {
					// ignore malformed messages
				}
			}

			ws.onclose = () => {
				reconnectTimer = setTimeout(connect, 2000)
			}
		}

		connect()

		return () => {
			clearTimeout(reconnectTimer)
			wsRef.current?.close()
			wsRef.current = null
		}
	}, [enabled, baseUrl, pushActivity])

	// Clear on disable
	useEffect(() => {
		if (!enabled) {
			setBuyOrders([])
			setSellOrders([])
			setActivity([])
			setMatchedPairs([])
			setTotalMatched(0)
			setTotalVolume(0)
			setMatchHistory([])
		}
	}, [enabled])

	return {
		buyOrders,
		sellOrders,
		activity,
		matchedPairs,
		totalMatched,
		totalVolume,
		chartData: [] as { t: number; bids: number; asks: number; matched: number; volume: number }[],
		matchHistory,
	}
}
