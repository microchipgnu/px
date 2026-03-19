import {
	generateBuyOrder,
	generateSellOrder,
	generateInitialBuyOrders,
	generateInitialSellOrders,
} from "@payload-exchange/protocol"
import type {
	ActivityEvent,
	ActivityEventType,
	BuyOrder,
	SellOrder,
} from "@payload-exchange/protocol"
import { useCallback, useEffect, useState } from "react"

const MAX_OPEN_ORDERS = 20
const MAX_ACTIVITY = 50
const MAX_CHART_POINTS = 60
const NEW_ORDER_INTERVAL = 2500
const MATCH_INTERVAL = 4000
const LIFECYCLE_INTERVAL = 1500
const CHART_TICK_INTERVAL = 1000

export type MatchedPair = {
	buyOrder: BuyOrder
	sellOrder: SellOrder
	stage: "matched" | "executing" | "fulfilled" | "attested" | "settled"
	matchedAt: number
}

export type ChartPoint = {
	t: number
	bids: number
	asks: number
	matched: number
	volume: number
}

export type MatchTick = {
	t: number
	price: number
}

function makeEvent(
	type: ActivityEventType,
	fields: Omit<ActivityEvent, "id" | "type" | "timestamp">,
): ActivityEvent {
	return { id: crypto.randomUUID(), type, timestamp: Math.floor(Date.now() / 1000), ...fields }
}

export function useSimulation(enabled: boolean) {
	const [buyOrders, setBuyOrders] = useState<BuyOrder[]>(() => generateInitialBuyOrders(12))
	const [sellOrders, setSellOrders] = useState<SellOrder[]>(() => generateInitialSellOrders(10))
	const [activity, setActivity] = useState<ActivityEvent[]>([])
	const [matchedPairs, setMatchedPairs] = useState<MatchedPair[]>([])
	const [totalMatched, setTotalMatched] = useState(0)
	const [totalVolume, setTotalVolume] = useState(0)
	const [chartData, setChartData] = useState<ChartPoint[]>([])
	const [matchHistory, setMatchHistory] = useState<MatchTick[]>([])

	const pushActivity = useCallback((event: ActivityEvent) => {
		setActivity((prev) => [event, ...prev].slice(0, MAX_ACTIVITY))
	}, [])

	// ── Clear / seed on mode change ─────────────────────────────────────────

	useEffect(() => {
		if (enabled) {
			setBuyOrders(generateInitialBuyOrders(12))
			setSellOrders(generateInitialSellOrders(10))
		} else {
			setBuyOrders([])
			setSellOrders([])
			setActivity([])
			setMatchedPairs([])
			setTotalMatched(0)
			setTotalVolume(0)
			setChartData([])
			setMatchHistory([])
		}
	}, [enabled])

	// ── Chart data ticker ───────────────────────────────────────────────────

	useEffect(() => {
		if (!enabled) return
		const interval = setInterval(() => {
			setBuyOrders((buys) => {
				setSellOrders((sells) => {
					setTotalMatched((m) => {
						setTotalVolume((v) => {
							setChartData((prev) => {
								const point: ChartPoint = {
									t: Date.now(),
									bids: buys.length,
									asks: sells.length,
									matched: m,
									volume: v,
								}
								return [...prev, point].slice(-MAX_CHART_POINTS)
							})
							return v
						})
						return m
					})
					return sells
				})
				return buys
			})
		}, CHART_TICK_INTERVAL)
		return () => clearInterval(interval)
	}, [enabled])

	// ── New orders arriving ─────────────────────────────────────────────────

	useEffect(() => {
		if (!enabled) return
		const interval = setInterval(() => {
			const isBuy = Math.random() > 0.4

			if (isBuy) {
				const order = generateBuyOrder()
				setBuyOrders((prev) => [order, ...prev].slice(0, MAX_OPEN_ORDERS))
				pushActivity(
					makeEvent("order_placed", {
						orderId: order.id,
						buyer: order.buyer,
						taskClass: order.taskClass,
						intent: order.intent,
						price: order.maxPrice,
					}),
				)
			} else {
				const order = generateSellOrder()
				setSellOrders((prev) => [order, ...prev].slice(0, MAX_OPEN_ORDERS))
				pushActivity(
					makeEvent("solver_joined", {
						seller: order.seller,
						taskClass: order.supportedTaskClasses[0],
						price: order.price,
						detail: (order.executionTerms as Record<string, string> | undefined)?.description,
					}),
				)
			}
		}, NEW_ORDER_INTERVAL)

		return () => clearInterval(interval)
	}, [enabled, pushActivity])

	// ── Matching engine ─────────────────────────────────────────────────────

	useEffect(() => {
		if (!enabled) return
		const interval = setInterval(() => {
			setBuyOrders((prevBuys) => {
				setSellOrders((prevSells) => {
					if (prevBuys.length === 0 || prevSells.length === 0) return prevSells

					const buyIdx = Math.floor(Math.random() * Math.min(prevBuys.length, 5))
					const buyOrder = prevBuys[buyIdx]

					const compatible = prevSells.filter((s) =>
						s.supportedTaskClasses.includes(buyOrder.taskClass),
					)
					if (compatible.length === 0) return prevSells

					const sellOrder = compatible[Math.floor(Math.random() * compatible.length)]
					const sellIdx = prevSells.indexOf(sellOrder)

					const pair: MatchedPair = {
						buyOrder: { ...buyOrder, status: "matched" },
						sellOrder: { ...sellOrder, status: "matched" },
						stage: "matched",
						matchedAt: Date.now(),
					}

					setMatchedPairs((prev) => [pair, ...prev].slice(0, 8))
					setTotalMatched((n) => n + 1)

					const matchPrice = Math.min(
						buyOrder.maxPrice,
						sellOrder.price + (buyOrder.maxPrice - sellOrder.price) * 0.5,
					)
					setTotalVolume((v) => v + matchPrice)
					setMatchHistory((prev) => [...prev, { t: Date.now(), price: matchPrice }].slice(-120))

					pushActivity(
						makeEvent("order_matched", {
							orderId: buyOrder.id,
							buyer: buyOrder.buyer,
							seller: sellOrder.seller,
							taskClass: buyOrder.taskClass,
							intent: buyOrder.intent,
							price: matchPrice,
						}),
					)

					const newSells = [...prevSells]
					newSells.splice(sellIdx, 1)
					return newSells
				})

				return prevBuys
			})

			setBuyOrders((prev) => {
				if (prev.length <= 3) return prev
				const idx = Math.floor(Math.random() * Math.min(prev.length, 5))
				return prev.filter((_, i) => i !== idx)
			})
		}, MATCH_INTERVAL)

		return () => clearInterval(interval)
	}, [enabled, pushActivity])

	// ── Lifecycle progression ───────────────────────────────────────────────

	useEffect(() => {
		if (!enabled) return
		const interval = setInterval(() => {
			setMatchedPairs((prev) => {
				const updated = prev.map((pair) => {
					const age = Date.now() - pair.matchedAt
					let nextStage = pair.stage

					if (pair.stage === "matched" && age > 2000) nextStage = "executing"
					else if (pair.stage === "executing" && age > 4000) nextStage = "fulfilled"
					else if (pair.stage === "fulfilled" && age > 6000) nextStage = "attested"
					else if (pair.stage === "attested" && age > 8000) nextStage = "settled"

					if (nextStage !== pair.stage) {
						const eventType: Record<string, ActivityEventType> = {
							executing: "execution_started",
							fulfilled: "fulfillment_submitted",
							attested: "attestation_passed",
							settled: "settlement_complete",
						}
						pushActivity(
							makeEvent(eventType[nextStage], {
								orderId: pair.buyOrder.id,
								buyer: pair.buyOrder.buyer,
								seller: pair.sellOrder.seller,
								taskClass: pair.buyOrder.taskClass,
								intent: pair.buyOrder.intent,
								price: pair.buyOrder.maxPrice,
							}),
						)
						return { ...pair, stage: nextStage as MatchedPair["stage"] }
					}
					return pair
				})

				return updated.filter((p) => {
					if (p.stage === "settled" && Date.now() - p.matchedAt > 12000) return false
					return true
				})
			})
		}, LIFECYCLE_INTERVAL)

		return () => clearInterval(interval)
	}, [enabled, pushActivity])

	// ── Expire old orders ───────────────────────────────────────────────────

	useEffect(() => {
		if (!enabled) return
		const interval = setInterval(() => {
			const now = Math.floor(Date.now() / 1000)
			setBuyOrders((prev) => prev.filter((o) => o.expiry > now))
		}, 10000)
		return () => clearInterval(interval)
	}, [enabled])

	return {
		buyOrders,
		sellOrders,
		activity,
		matchedPairs,
		totalMatched,
		totalVolume,
		chartData,
		matchHistory,
	}
}
