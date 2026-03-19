import { ActivityFeed } from "@/components/ActivityFeed"
import { DepthChart } from "@/components/DepthChart"
import { FilterBar } from "@/components/FilterBar"
import { Header, type DataMode } from "@/components/Header"
import { Orderbook } from "@/components/Orderbook"
import { Pipeline } from "@/components/Pipeline"
import { Stats } from "@/components/Stats"
import { useOrderbook } from "@/hooks/useOrderbook"
import { useEffect, useState } from "react"

export function App() {
	const [mode, setMode] = useState<DataMode>("mock")

	const {
		buyOrders,
		sellOrders,
		filter,
		updateFilter,
		stats,
		activity,
		matchedPairs,
		totalMatched,
		totalVolume,
		matchHistory,
	} = useOrderbook(mode)

	const [opm, setOpm] = useState(0)
	useEffect(() => {
		const now = Math.floor(Date.now() / 1000)
		const recentEvents = activity.filter((e) => now - e.timestamp < 60)
		setOpm(recentEvents.length)
	}, [activity])

	return (
		<div className="h-dvh flex flex-col bg-background overflow-hidden">
			<Header
				totalMatched={totalMatched}
				totalVolume={totalVolume}
				ordersPerMinute={opm}
				mode={mode}
				onModeChange={setMode}
			/>
			<Stats
				bestBid={stats.bestBid}
				bestAsk={stats.bestAsk}
				spread={stats.spread}
				totalBidVolume={stats.totalBidVolume}
				totalAskVolume={stats.totalAskVolume}
				bidCount={buyOrders.length}
				askCount={sellOrders.length}
			/>
			<FilterBar filter={filter} onFilterChange={updateFilter} />
			<div className="flex-1 min-h-0 flex flex-col overflow-hidden">
				<div className="flex-1 min-h-0 overflow-hidden">
					<Orderbook buyOrders={buyOrders} sellOrders={sellOrders} />
				</div>
				<DepthChart buyOrders={buyOrders} sellOrders={sellOrders} matchHistory={matchHistory} />
				<Pipeline pairs={matchedPairs} />
				<ActivityFeed events={activity} />
			</div>
		</div>
	)
}
