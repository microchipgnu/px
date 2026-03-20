import type { BuyOrder, SellOrder } from "@payload-exchange/protocol"
import { formatExpiry, formatPrice, formatTime, truncateAddress } from "@/lib/format"
import { useState } from "react"

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

type MobileTab = "bids" | "asks"

export function Orderbook({ buyOrders, sellOrders, bestBid, bestAsk, spread }: Props) {
	const [mobileTab, setMobileTab] = useState<MobileTab>("bids")

	return (
		<>
			{/* Inline stats bar */}
			{(bestBid !== undefined || bestAsk !== undefined) && (
				<div className="px-4 py-1 border-b border-border bg-card flex items-center gap-4 font-mono text-[10px] tracking-[0.5px] shrink-0">
					<span className="text-muted-foreground">OPEN</span>
					{bestBid !== undefined && bestBid > 0 && (
						<span className="text-muted-foreground">
							BID <span className="text-bid ml-1">${formatPrice(bestBid)}</span>
						</span>
					)}
					{bestAsk !== undefined && bestAsk > 0 && (
						<span className="text-muted-foreground">
							ASK <span className="text-ask ml-1">${formatPrice(bestAsk)}</span>
						</span>
					)}
					{spread !== undefined && spread > 0 && (
						<span className="text-muted-foreground">
							SPREAD <span className="text-foreground ml-1">${formatPrice(spread)}</span>
						</span>
					)}
				</div>
			)}

			{/* Mobile tab switcher */}
			<div className="sm:hidden flex border-b border-border bg-card">
				<button
					type="button"
					onClick={() => setMobileTab("bids")}
					className={`flex-1 flex items-center justify-center gap-2 h-9 font-mono text-[11px] font-medium tracking-[0.5px] transition-all duration-300 ${
						mobileTab === "bids"
							? "bg-foreground text-background"
							: "text-muted-foreground hover:text-foreground hover:bg-foreground/5"
					}`}
				>
					BUY INTENTS
					<span className={`text-[10px] ${mobileTab === "bids" ? "text-background/60" : "text-muted-foreground"}`}>
						{buyOrders.length}
					</span>
				</button>
				<button
					type="button"
					onClick={() => setMobileTab("asks")}
					className={`flex-1 flex items-center justify-center gap-2 h-9 font-mono text-[11px] font-medium tracking-[0.5px] transition-all duration-300 ${
						mobileTab === "asks"
							? "bg-foreground text-background"
							: "text-muted-foreground hover:text-foreground hover:bg-foreground/5"
					}`}
				>
					SOLVER OFFERS
					<span className={`text-[10px] ${mobileTab === "asks" ? "text-background/60" : "text-muted-foreground"}`}>
						{sellOrders.length}
					</span>
				</button>
			</div>

			{/* Desktop: side by side */}
			<div className="hidden sm:grid grid-cols-2 overflow-hidden h-full">
				<BidsColumn orders={buyOrders} />
				<AsksColumn orders={sellOrders} />
			</div>

			{/* Mobile: tabbed */}
			<div className="sm:hidden overflow-hidden flex-1">
				{mobileTab === "bids" ? (
					<BidsColumn orders={buyOrders} hideHeader />
				) : (
					<AsksColumn orders={sellOrders} hideHeader />
				)}
			</div>
		</>
	)
}

function BidsColumn({ orders, hideHeader }: { orders: BuyOrder[]; hideHeader?: boolean }) {
	return (
		<div className="flex flex-col overflow-hidden border-r border-border">
			{!hideHeader && (
				<div className="px-4 py-2 border-b border-border flex items-center gap-2 bg-card shrink-0">
					<span className="size-1.5 rounded-full bg-bid" />
					<span className="font-mono text-[11px] font-medium tracking-[0.5px] text-bid">
						BUY INTENTS
					</span>
					<span className="ml-auto font-mono text-[10px] text-muted-foreground tracking-[0.5px]">
						{orders.length}
					</span>
				</div>
			)}

			<div className="grid grid-cols-[1fr_56px_40px_44px] sm:grid-cols-[1fr_64px_44px_50px] px-4 py-1.5 font-mono text-[9px] sm:text-[10px] text-muted-foreground tracking-[0.5px] border-b border-border bg-muted-2 shrink-0">
				<span>INTENT</span>
				<span className="text-right">FEE</span>
				<span className="text-right">TTL</span>
				<span className="text-right">AGE</span>
			</div>

			<div className="flex-1 overflow-y-auto">
				{orders.map((order) => (
					<BidRow key={order.id} order={order} maxPrice={orders[0]?.maxPrice ?? 1} />
				))}
				{orders.length === 0 && <EmptyState text="NO BUY INTENTS" />}
			</div>
		</div>
	)
}

function AsksColumn({ orders, hideHeader }: { orders: SellOrder[]; hideHeader?: boolean }) {
	return (
		<div className="flex flex-col overflow-hidden">
			{!hideHeader && (
				<div className="px-4 py-2 border-b border-border flex items-center gap-2 bg-card shrink-0">
					<span className="size-1.5 rounded-full bg-ask" />
					<span className="font-mono text-[11px] font-medium tracking-[0.5px] text-ask">
						SOLVER OFFERS
					</span>
					<span className="ml-auto font-mono text-[10px] text-muted-foreground tracking-[0.5px]">
						{orders.length}
					</span>
				</div>
			)}

			<div className="grid grid-cols-[1fr_56px_56px_44px] sm:grid-cols-[1fr_64px_64px_50px] px-4 py-1.5 font-mono text-[9px] sm:text-[10px] text-muted-foreground tracking-[0.5px] border-b border-border bg-muted-2 shrink-0">
				<span>SOLVER</span>
				<span className="text-right">PRICE</span>
				<span className="text-right">STAKE</span>
				<span className="text-right">REP</span>
			</div>

			<div className="flex-1 overflow-y-auto">
				{orders.map((order) => (
					<AskRow key={order.id} order={order} maxStake={Math.max(...orders.map(o => o.stake), 1)} />
				))}
				{orders.length === 0 && <EmptyState text="NO SOLVER OFFERS" />}
			</div>
		</div>
	)
}

function BidRow({ order, maxPrice }: { order: BuyOrder; maxPrice: number }) {
	const barWidth = (order.maxPrice / maxPrice) * 100

	return (
		<div className="group relative grid grid-cols-[1fr_56px_40px_44px] sm:grid-cols-[1fr_64px_44px_50px] px-4 py-2 border-b border-border hover:bg-foreground/5 transition-all duration-300 cursor-pointer animate-[fade-in_0.3s_ease-out]">
			<div
				className="absolute inset-y-0 left-0 bg-bid-bg transition-all duration-500"
				style={{ width: `${barWidth}%` }}
			/>
			<div className="relative z-10 min-w-0">
				<div className="text-[11px] sm:text-xs text-foreground truncate pr-2">{order.intent}</div>
				<div className="flex items-center gap-1.5 mt-0.5">
					<span className="font-mono text-[9px] sm:text-[10px] text-muted-foreground">
						{truncateAddress(order.buyer)}
					</span>
					<span className="font-mono text-[8px] sm:text-[9px] font-medium tracking-[0.5px] text-muted-foreground bg-muted px-1 py-0 rounded-[2px]">
						{TASK_LABELS[order.taskClass] ?? order.taskClass}
					</span>
				</div>
			</div>
			<div className="relative z-10 text-right self-center">
				<span className="font-mono text-[11px] sm:text-xs font-medium text-bid">
					${formatPrice(order.maxPrice)}
				</span>
			</div>
			<div className="relative z-10 text-right self-center font-mono text-[9px] sm:text-[10px] text-muted-foreground">
				{formatExpiry(order.expiry)}
			</div>
			<div className="relative z-10 text-right self-center font-mono text-[9px] sm:text-[10px] text-muted-foreground">
				{formatTime(order.createdAt)}
			</div>
		</div>
	)
}

function AskRow({ order, maxStake }: { order: SellOrder; maxStake: number }) {
	const barWidth = (order.stake / maxStake) * 100

	return (
		<div className="group relative grid grid-cols-[1fr_56px_56px_44px] sm:grid-cols-[1fr_64px_64px_50px] px-4 py-2 border-b border-border hover:bg-foreground/5 transition-all duration-300 cursor-pointer animate-[fade-in_0.3s_ease-out]">
			<div
				className="absolute inset-y-0 right-0 bg-ask-bg transition-all duration-500"
				style={{ width: `${barWidth}%` }}
			/>
			<div className="relative z-10 min-w-0">
				<div className="text-[11px] sm:text-xs text-foreground truncate pr-2">
					{(order.executionTerms as Record<string, string> | undefined)?.description ?? ""}
				</div>
				<div className="flex items-center gap-1 sm:gap-1.5 mt-0.5 overflow-hidden">
					<span className="font-mono text-[9px] sm:text-[10px] text-muted-foreground shrink-0">
						{truncateAddress(order.seller)}
					</span>
					<span className="font-mono text-[8px] sm:text-[9px] font-medium tracking-[0.5px] text-accent bg-accent-bg px-1 py-0 rounded-[2px] shrink-0">
						{order.pricingModel.toUpperCase()}
					</span>
					{order.supportedTaskClasses.slice(0, 2).map((tc) => (
						<span key={tc} className="hidden sm:inline font-mono text-[9px] font-medium tracking-[0.5px] text-muted-foreground bg-muted px-1 py-0 rounded-[2px]">
							{TASK_LABELS[tc] ?? tc}
						</span>
					))}
				</div>
			</div>
			<div className="relative z-10 text-right self-center">
				<span className="font-mono text-[11px] sm:text-xs font-medium text-ask">
					${formatPrice(order.price)}
				</span>
			</div>
			<div className="relative z-10 text-right self-center font-mono text-[9px] sm:text-[10px] text-muted-foreground">
				${formatPrice(order.stake)}
			</div>
			<div className="relative z-10 text-right self-center">
				<RepBar value={order.reputation.successRate} />
			</div>
		</div>
	)
}

function RepBar({ value }: { value: number }) {
	const pct = Math.round(value * 100)
	const color = value >= 0.9 ? "bg-bid" : value >= 0.7 ? "bg-amber-500" : "bg-ask"

	return (
		<div className="flex items-center gap-1 justify-end">
			<div className="w-5 sm:w-6 h-1 bg-muted overflow-hidden rounded-[2px]">
				<div className={`h-full ${color}`} style={{ width: `${pct}%` }} />
			</div>
			<span className="font-mono text-[8px] sm:text-[9px] text-muted-foreground">{pct}</span>
		</div>
	)
}

function EmptyState({ text }: { text: string }) {
	return (
		<div className="flex items-center justify-center h-24 font-mono text-xs text-muted-foreground tracking-[0.5px]">
			{text}
		</div>
	)
}
