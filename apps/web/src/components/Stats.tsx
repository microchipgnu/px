import { formatPrice } from "@/lib/format"

type Props = {
	bestBid: number
	bestAsk: number
	spread: number
	totalBidVolume: number
	totalAskVolume: number
	bidCount: number
	askCount: number
}

export function Stats({
	bestBid,
	bestAsk,
	spread,
	totalBidVolume,
	totalAskVolume,
	bidCount,
	askCount,
}: Props) {
	return (
		<div className="border-b border-border bg-card px-4 sm:px-8 lg:px-12 py-2 sm:py-3">
			<div className="flex flex-wrap items-center gap-x-5 gap-y-1 font-mono text-xs">
				<Stat label="BEST BID" value={`$${formatPrice(bestBid)}`} color="text-bid" />
				<Stat label="BEST ASK" value={`$${formatPrice(bestAsk)}`} color="text-ask" />
				<Stat label="SPREAD" value={`$${formatPrice(Math.abs(spread))}`} />
				<span className="hidden sm:contents">
					<Stat label="BID DEPTH" value={`$${formatPrice(totalBidVolume)}`} color="text-bid" />
					<Stat label="ASK DEPTH" value={`$${formatPrice(totalAskVolume)}`} color="text-ask" />
				</span>
				<Stat label="BIDS" value={String(bidCount)} />
				<Stat label="ASKS" value={String(askCount)} />
			</div>
		</div>
	)
}

function Stat({ label, value, color }: { label: string; value: string; color?: string }) {
	return (
		<div>
			<div className="text-[9px] sm:text-[10px] text-muted-foreground tracking-[0.5px] mb-0.5">{label}</div>
			<div className={`text-xs sm:text-sm font-medium ${color ?? "text-foreground"}`}>{value}</div>
		</div>
	)
}
