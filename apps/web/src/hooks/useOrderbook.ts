import type { BuyOrder, SellOrder, TaskClass } from "@payload-exchange/protocol"
import { useCallback, useMemo, useState } from "react"
import type { DataMode } from "@/components/Header"
import { useLiveData } from "./useLiveData"
import { useSimulation } from "./useSimulation"

export type OrderbookFilter = {
	taskClass: TaskClass | "all"
	search: string
}

export function useOrderbook(mode: DataMode) {
	const sim = useSimulation(mode === "mock")
	const live = useLiveData(mode === "live")
	const source = mode === "mock" ? sim : live

	const [filter, setFilter] = useState<OrderbookFilter>({
		taskClass: "all",
		search: "",
	})

	const filteredBuyOrders = useMemo(() => {
		let orders = [...source.buyOrders]
		if (filter.taskClass !== "all") {
			orders = orders.filter((o) => o.taskClass === filter.taskClass)
		}
		if (filter.search) {
			const q = filter.search.toLowerCase()
			orders = orders.filter(
				(o) => o.intent.toLowerCase().includes(q) || o.buyer.toLowerCase().includes(q),
			)
		}
		return orders.sort((a, b) => b.maxPrice - a.maxPrice)
	}, [source.buyOrders, filter])

	const filteredSellOrders = useMemo(() => {
		let orders = [...source.sellOrders]
		if (filter.taskClass !== "all") {
			orders = orders.filter((o) => o.supportedTaskClasses.includes(filter.taskClass as TaskClass))
		}
		if (filter.search) {
			const q = filter.search.toLowerCase()
			orders = orders.filter(
				(o) =>
					(((o.executionTerms as Record<string, string> | undefined)?.description ?? "").toLowerCase().includes(q)) ||
					o.seller.toLowerCase().includes(q),
			)
		}
		return orders.sort((a, b) => a.price - b.price)
	}, [source.sellOrders, filter])

	const stats = useMemo(() => {
		const totalBidVolume = filteredBuyOrders.reduce((sum, o) => sum + o.maxPrice, 0)
		const totalAskVolume = filteredSellOrders.reduce((sum, o) => sum + o.price, 0)
		const bestBid = filteredBuyOrders[0]?.maxPrice ?? 0
		const bestAsk = filteredSellOrders[0]?.price ?? 0
		const spread = bestAsk > 0 && bestBid > 0 ? bestAsk - bestBid : 0
		return { totalBidVolume, totalAskVolume, bestBid, bestAsk, spread }
	}, [filteredBuyOrders, filteredSellOrders])

	const updateFilter = useCallback((update: Partial<OrderbookFilter>) => {
		setFilter((prev) => ({ ...prev, ...update }))
	}, [])

	return {
		buyOrders: filteredBuyOrders,
		sellOrders: filteredSellOrders,
		filter,
		updateFilter,
		stats,
		activity: source.activity,
		activityTotal: "activityTotal" in source ? (source as { activityTotal: number }).activityTotal : source.activity.length,
		activityLoading: "activityLoading" in source ? (source as { activityLoading: boolean }).activityLoading : false,
		loadMoreActivity: "loadMoreActivity" in source ? (source as { loadMoreActivity: () => void }).loadMoreActivity : undefined,
		matchedPairs: source.matchedPairs,
		totalMatched: source.totalMatched,
		totalVolume: source.totalVolume,
		chartData: source.chartData,
		matchHistory: source.matchHistory,
	}
}
