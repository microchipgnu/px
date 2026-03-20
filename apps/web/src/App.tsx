import { ActivityFeed } from "@/components/ActivityFeed"
import { DepthChart } from "@/components/DepthChart"
import { Header, type DataMode } from "@/components/Header"
import { Orderbook } from "@/components/Orderbook"
import { Pipeline } from "@/components/Pipeline"
import { Results } from "@/components/Results"
import { useOrderbook } from "@/hooks/useOrderbook"
import { formatPrice } from "@/lib/format"
import { useEffect, useState, useSyncExternalStore } from "react"

type MobileTab = "pipeline" | "orderbook" | "activity"
type Page = "dashboard" | "results"

function getPage(): Page {
	return window.location.hash === "#results" ? "results" : "dashboard"
}

function useHashPage(): Page {
	return useSyncExternalStore(
		(cb) => { window.addEventListener("hashchange", cb); return () => window.removeEventListener("hashchange", cb) },
		getPage,
	)
}

export function App() {
	const [mode, setMode] = useState<DataMode>("live")
	const [mobileTab, setMobileTab] = useState<MobileTab>("pipeline")
	const page = useHashPage()

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

	// Build results data from matchedPairs
	const resultEntries = matchedPairs
		.filter((p) => p.stage === "settled")
		.map((p) => ({
			orderId: p.buyOrder.id,
			intent: p.buyOrder.intent,
			taskClass: p.buyOrder.taskClass,
			buyer: p.buyOrder.buyer,
			seller: p.sellOrder.seller,
			result: (p as Record<string, unknown>).result ?? null,
			proof: (p as Record<string, unknown>).proof ?? null,
			agreedPrice: p.buyOrder.maxPrice,
			settledAt: p.settledAt ? p.settledAt / 1000 : undefined,
			fulfilledAt: p.fulfilledAt ? p.fulfilledAt / 1000 : undefined,
			txHash: (p as Record<string, unknown>).txHash as string | undefined,
			status: p.stage,
		}))

	return (
		<div className="h-dvh grid grid-rows-[auto_auto_auto_1fr] lg:grid-rows-[auto_auto_1fr] bg-background overflow-hidden">
			<Header
				totalMatched={totalMatched}
				totalVolume={totalVolume}
				ordersPerMinute={opm}
				mode={mode}
				onModeChange={setMode}
				page={page}
			/>

			{/* Stats ribbon */}
			<div className="border-b border-border bg-card/50 backdrop-blur px-4 sm:px-6 py-1.5 flex items-center gap-4 sm:gap-6 font-mono text-[10px] tracking-[0.5px] overflow-x-auto scrollbar-none">
				<StatPill label="MATCHED" value={String(totalMatched)} />
				<StatPill label="VOL" value={`$${formatPrice(totalVolume)}`} />
				<StatPill label="BIDS" value={String(buyOrders.length)} color="text-bid" />
				<StatPill label="ASKS" value={String(sellOrders.length)} color="text-ask" />
				{stats.bestBid > 0 && <StatPill label="BEST BID" value={`$${formatPrice(stats.bestBid)}`} color="text-bid" />}
				{stats.bestAsk > 0 && <StatPill label="BEST ASK" value={`$${formatPrice(stats.bestAsk)}`} color="text-ask" />}
				{stats.spread > 0 && <StatPill label="SPREAD" value={`$${formatPrice(stats.spread)}`} />}
			</div>

			{page === "results" ? (
				/* Results page */
				<div className="min-h-0 overflow-hidden">
					<Results entries={resultEntries} />
				</div>
			) : (
				<>
					{/* Mobile tab bar */}
					<div className="lg:hidden flex border-b border-border bg-card/50">
						{(["pipeline", "orderbook", "activity"] as const).map((tab) => (
							<button
								key={tab}
								type="button"
								onClick={() => setMobileTab(tab)}
								className={`flex-1 py-2 font-mono text-[10px] font-semibold tracking-[0.5px] transition-all duration-300 ${
									mobileTab === tab
										? "text-foreground border-b-2 border-foreground"
										: "text-muted-foreground/50 hover:text-muted-foreground"
								}`}
							>
								{tab === "pipeline" ? "PIPELINE" : tab === "orderbook" ? "ORDERBOOK" : "ACTIVITY"}
							</button>
						))}
					</div>

					{/* Desktop: three-column grid */}
					<div className="min-h-0 hidden lg:grid lg:grid-cols-[280px_1fr_300px] overflow-hidden">
						<div className="flex flex-col overflow-hidden border-r border-border">
							<Orderbook buyOrders={buyOrders} sellOrders={sellOrders} />
						</div>
						<div className="flex flex-col overflow-hidden border-r border-border">
							<Pipeline pairs={matchedPairs} />
						</div>
						<div className="flex flex-col overflow-hidden">
							<div className="shrink-0 max-h-[50%] overflow-y-auto">
								<DepthChart buyOrders={buyOrders} sellOrders={sellOrders} matchHistory={matchHistory} />
							</div>
							<div className="flex-1 min-h-0 overflow-hidden">
								<ActivityFeed events={activity} />
							</div>
						</div>
					</div>

					{/* Mobile: tabbed content */}
					<div className="min-h-0 lg:hidden flex flex-col overflow-hidden">
						{mobileTab === "pipeline" && <Pipeline pairs={matchedPairs} />}
						{mobileTab === "orderbook" && <Orderbook buyOrders={buyOrders} sellOrders={sellOrders} />}
						{mobileTab === "activity" && (
							<div className="flex-1 flex flex-col overflow-hidden">
								<div className="shrink-0 border-b border-border">
									<DepthChart buyOrders={buyOrders} sellOrders={sellOrders} matchHistory={matchHistory} />
								</div>
								<div className="flex-1 min-h-0 overflow-hidden">
									<ActivityFeed events={activity} />
								</div>
							</div>
						)}
					</div>
				</>
			)}
		</div>
	)
}

function StatPill({ label, value, color }: { label: string; value: string; color?: string }) {
	return (
		<div className="flex items-center gap-1.5 shrink-0">
			<span className="text-muted-foreground">{label}</span>
			<span className={`font-medium ${color ?? "text-foreground"}`}>{value}</span>
		</div>
	)
}
