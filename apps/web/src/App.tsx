import { ActivityFeed } from "@/components/ActivityFeed"
import { DepthChart } from "@/components/DepthChart"
import { Header, type DataMode } from "@/components/Header"
import { Orderbook } from "@/components/Orderbook"
import { Pipeline } from "@/components/Pipeline"
import { useOrderbook } from "@/hooks/useOrderbook"
import { useEffect, useState } from "react"

export function App() {
	const [mode, setMode] = useState<DataMode>("live")

	const {
		buyOrders,
		sellOrders,
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

			{/* The star: execution pipeline */}
			<Pipeline pairs={matchedPairs} />

			{/* Open orders + depth */}
			<div className="flex-1 min-h-0 flex overflow-hidden">
				<div className="flex-1 min-h-0 overflow-hidden">
					<Orderbook
						buyOrders={buyOrders}
						sellOrders={sellOrders}
						bestBid={stats.bestBid}
						bestAsk={stats.bestAsk}
						spread={stats.spread}
					/>
				</div>
				<div className="hidden lg:block w-80 border-l border-border shrink-0">
					<DepthChart buyOrders={buyOrders} sellOrders={sellOrders} matchHistory={matchHistory} />
				</div>
			</div>

			<ActivityFeed events={activity} />
		</div>
	)
}
