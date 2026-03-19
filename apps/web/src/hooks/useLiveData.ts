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

function wsUrl(): string {
	const proto = window.location.protocol === "https:" ? "wss:" : "ws:"
	return `${proto}//${window.location.host}/ws`
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

export function useLiveData(enabled: boolean) {
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
				const res = await fetch("/api/activity")
				if (!res.ok) return
				const events = (await res.json()) as Array<{
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
	}, [enabled])

	// Poll orderbook snapshot
	useEffect(() => {
		if (!enabled) return

		const poll = async () => {
			try {
				const res = await fetch("/api/orders")
				if (!res.ok) return
				const data = await res.json()
				setBuyOrders(data.buyOrders ?? [])
				setSellOrders(data.sellOrders ?? [])

				// Derive matched pairs from assignments
				const pairs: MatchedPair[] = (data.assignments ?? [])
					.map((a: Assignment) => {
						const buyOrder = (data.buyOrders ?? []).find((o: BuyOrder) => o.id === a.orderId)
						const sellOrder = (data.sellOrders ?? []).find((o: SellOrder) => o.id === a.sellerOrderId)
						if (!buyOrder || !sellOrder) return null
						return {
							buyOrder,
							sellOrder,
							stage:
								buyOrder.status === "settled"
									? "settled"
									: buyOrder.status === "attested"
										? "attested"
										: buyOrder.status === "fulfilled"
											? "fulfilled"
											: buyOrder.status === "executing"
												? "executing"
												: "matched",
							matchedAt: a.createdAt * 1000,
						} satisfies MatchedPair
					})
					.filter(Boolean) as MatchedPair[]

				setMatchedPairs(pairs.slice(0, 8))
			} catch {
				// coordinator unreachable
			}
		}

		poll()
		const interval = setInterval(poll, POLL_INTERVAL)
		return () => clearInterval(interval)
	}, [enabled])

	// WebSocket for real-time activity events
	useEffect(() => {
		if (!enabled) return

		let reconnectTimer: ReturnType<typeof setTimeout>

		const connect = () => {
			const ws = new WebSocket(wsUrl())
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
	}, [enabled, pushActivity])

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
