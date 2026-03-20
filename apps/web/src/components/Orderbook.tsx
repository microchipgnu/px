import type { BuyOrder, SellOrder } from "@payload-exchange/protocol"
import { formatExpiry, formatPrice, truncateAddress } from "@/lib/format"

type Props = {
	buyOrders: BuyOrder[]
	sellOrders: SellOrder[]
	bestBid?: number
	bestAsk?: number
	spread?: number
}

const TASK_LABELS: Record<string, string> = {
	onchain_swap: "SWAP",
	bridge: "BRIDGE",
	yield: "YIELD",
	price_feed: "FEED",
	search: "SEARCH",
	computation: "COMPUTE",
	monitoring: "MONITOR",
	smart_contract: "CONTRACT",
}

export function Orderbook({ buyOrders, sellOrders }: Props) {
	return (
		<div className="h-full flex flex-col overflow-hidden">
			{/* Buy intents section */}
			<div className="flex flex-col min-h-[120px] flex-1 overflow-hidden">
				<div className="px-3 py-2 border-b border-border flex items-center gap-2 bg-card/50 shrink-0">
					<span className="size-1.5 rounded-full bg-bid" />
					<span className="font-mono text-[10px] font-semibold tracking-[0.5px] text-bid">
						BUY INTENTS
					</span>
					<span className="ml-auto font-mono text-[10px] text-muted-foreground">
						{buyOrders.length}
					</span>
				</div>

				<div className="flex-1 overflow-y-auto">
					{buyOrders.length === 0 && (
						<div className="flex items-center justify-center h-full py-6">
							<span className="font-mono text-[10px] text-muted-foreground/30 tracking-[0.5px]">
								NO OPEN INTENTS
							</span>
						</div>
					)}
					{buyOrders.map((order) => (
						<div key={order.id} className="px-3 py-1.5 border-b border-border hover:bg-foreground/[0.02] transition-colors">
							<div className="flex items-center gap-1.5">
								<span className="font-mono text-[9px] text-muted-foreground/50 px-1 py-0 bg-muted rounded-[2px]">
									{TASK_LABELS[order.taskClass] ?? order.taskClass}
								</span>
								<span className="font-mono text-[10px] font-medium text-bid ml-auto">
									${formatPrice(order.maxPrice)}
								</span>
							</div>
							<div className="text-[10px] text-foreground/70 truncate mt-0.5">
								{order.intent}
							</div>
							<div className="flex items-center gap-2 mt-0.5">
								<span className="font-mono text-[8px] text-muted-foreground/40">
									{truncateAddress(order.buyer)}
								</span>
								<span className="font-mono text-[8px] text-muted-foreground/30 ml-auto">
									{formatExpiry(order.expiry)}
								</span>
							</div>
						</div>
					))}
				</div>
			</div>

			{/* Solver offers section */}
			<div className="flex flex-col flex-1 overflow-hidden border-t border-border">
				<div className="px-3 py-2 border-b border-border flex items-center gap-2 bg-card/50 shrink-0">
					<span className="size-1.5 rounded-full bg-ask" />
					<span className="font-mono text-[10px] font-semibold tracking-[0.5px] text-ask">
						SOLVER OFFERS
					</span>
					<span className="ml-auto font-mono text-[10px] text-muted-foreground">
						{sellOrders.length}
					</span>
				</div>

				<div className="flex-1 overflow-y-auto">
					{sellOrders.length === 0 && (
						<div className="flex items-center justify-center h-full py-6">
							<span className="font-mono text-[10px] text-muted-foreground/30 tracking-[0.5px]">
								NO OPEN OFFERS
							</span>
						</div>
					)}
					{sellOrders.map((order) => (
						<div key={order.id} className="px-3 py-1.5 border-b border-border hover:bg-foreground/[0.02] transition-colors">
							<div className="flex items-center gap-1.5">
								<span className="font-mono text-[9px] text-muted-foreground/60 truncate">
									{truncateAddress(order.seller)}
								</span>
								<span className="font-mono text-[10px] font-medium text-ask ml-auto">
									${formatPrice(order.price)}
								</span>
							</div>
							<div className="flex items-center gap-1 mt-0.5 overflow-hidden">
								{order.supportedTaskClasses.slice(0, 3).map((tc) => (
									<span key={tc} className="font-mono text-[8px] text-muted-foreground/40 px-1 py-0 bg-muted rounded-[2px]">
										{TASK_LABELS[tc] ?? tc}
									</span>
								))}
								{order.supportedTaskClasses.length > 3 && (
									<span className="font-mono text-[8px] text-muted-foreground/30">
										+{order.supportedTaskClasses.length - 3}
									</span>
								)}
							</div>
						</div>
					))}
				</div>
			</div>
		</div>
	)
}
