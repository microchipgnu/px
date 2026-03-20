import type { BuyOrder, SellOrder } from "@payload-exchange/protocol"
import type { MatchTick } from "@/hooks/useSimulation"
import { formatPrice } from "@/lib/format"
import { useCallback, useEffect, useMemo, useRef } from "react"

type Props = {
	buyOrders: BuyOrder[]
	sellOrders: SellOrder[]
	matchHistory: MatchTick[]
}

const BID_COLOR = "#0d9488"
const BID_FILL = "rgba(13, 148, 136, 0.15)"
const ASK_COLOR = "#ef4444"
const ASK_FILL = "rgba(239, 68, 68, 0.15)"
const GRID_COLOR = "#1C2123"
const LABEL_COLOR = "#555A5A"
const TEXT_COLOR = "#8A8F8F"

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

function bucketVolume(history: MatchTick[], count: number) {
	if (history.length === 0) return []
	const now = Date.now()
	const window = 120_000
	const start = now - window
	const bucketMs = window / count
	const buckets: number[] = new Array(count).fill(0)
	for (const tick of history) {
		if (tick.t < start) continue
		const idx = Math.min(Math.floor((tick.t - start) / bucketMs), count - 1)
		buckets[idx] += tick.price
	}
	return buckets
}

export function DepthChart({ buyOrders, sellOrders, matchHistory }: Props) {
	const sparkRef = useRef<HTMLCanvasElement>(null)
	const sparkContainerRef = useRef<HTMLDivElement>(null)

	const volBuckets = useMemo(() => bucketVolume(matchHistory, 24), [matchHistory])

	// Group orders by task class
	const bidsByTask = useMemo(() => {
		const map = new Map<string, { count: number; volume: number }>()
		for (const o of buyOrders) {
			const label = TASK_LABELS[o.taskClass] ?? o.taskClass
			const prev = map.get(label) ?? { count: 0, volume: 0 }
			map.set(label, { count: prev.count + 1, volume: prev.volume + o.maxPrice })
		}
		return [...map.entries()].sort((a, b) => b[1].count - a[1].count)
	}, [buyOrders])

	const asksByTask = useMemo(() => {
		const map = new Map<string, number>()
		for (const o of sellOrders) {
			for (const tc of o.supportedTaskClasses) {
				const label = TASK_LABELS[tc] ?? tc
				map.set(label, (map.get(label) ?? 0) + 1)
			}
		}
		return [...map.entries()].sort((a, b) => b[1] - a[1])
	}, [sellOrders])

	const bestBid = useMemo(() => {
		if (buyOrders.length === 0) return 0
		return Math.max(...buyOrders.map((o) => o.maxPrice))
	}, [buyOrders])

	const bestAsk = useMemo(() => {
		if (sellOrders.length === 0) return 0
		return Math.min(...sellOrders.map((o) => o.price))
	}, [sellOrders])

	const totalBids = buyOrders.length
	const totalAsks = sellOrders.length
	const totalMax = Math.max(totalBids, totalAsks, 1)

	// Draw sparkline
	const drawSparkline = useCallback(() => {
		const canvas = sparkRef.current
		const container = sparkContainerRef.current
		if (!canvas || !container) return

		const dpr = window.devicePixelRatio || 1
		const rect = container.getBoundingClientRect()
		const w = rect.width
		const h = rect.height
		canvas.width = w * dpr
		canvas.height = h * dpr
		canvas.style.width = `${w}px`
		canvas.style.height = `${h}px`

		const ctx = canvas.getContext("2d")
		if (!ctx) return
		ctx.scale(dpr, dpr)
		ctx.clearRect(0, 0, w, h)

		if (volBuckets.length === 0) {
			ctx.fillStyle = LABEL_COLOR
			ctx.font = "9px 'Geist Mono', monospace"
			ctx.textAlign = "center"
			ctx.fillText("NO RECENT ACTIVITY", w / 2, h / 2 + 3)
			return
		}

		const maxVol = Math.max(...volBuckets, 0.001)
		const gap = 2
		const barW = Math.max((w - gap * (volBuckets.length - 1)) / volBuckets.length, 2)

		for (let i = 0; i < volBuckets.length; i++) {
			const val = volBuckets[i]
			if (val === 0) continue
			const barH = Math.max((val / maxVol) * (h - 4), 1)
			const x = i * (barW + gap)
			const y = h - barH - 2

			ctx.fillStyle = BID_COLOR
			ctx.globalAlpha = 0.3 + (i / volBuckets.length) * 0.5
			ctx.beginPath()
			ctx.roundRect(x, y, barW, barH, 1)
			ctx.fill()
		}
		ctx.globalAlpha = 1
	}, [volBuckets])

	useEffect(() => { drawSparkline() }, [drawSparkline])

	return (
		<div className="h-full flex flex-col overflow-y-auto bg-card">
			{/* Summary stats */}
			<div className="px-4 py-3 border-b border-border">
				<div className="font-mono text-[10px] text-muted-foreground tracking-[0.5px] mb-3">MARKET DEPTH</div>

				<div className="flex items-center gap-2 mb-2">
					<span className="size-1.5 rounded-full" style={{ backgroundColor: BID_COLOR }} />
					<span className="font-mono text-[10px] text-muted-foreground">BIDS</span>
					<span className="font-mono text-[11px] text-foreground ml-auto">{totalBids}</span>
				</div>
				<div className="flex items-center gap-2 mb-3">
					<span className="size-1.5 rounded-full" style={{ backgroundColor: ASK_COLOR }} />
					<span className="font-mono text-[10px] text-muted-foreground">ASKS</span>
					<span className="font-mono text-[11px] text-foreground ml-auto">{totalAsks}</span>
				</div>

				{/* Balance bar */}
				<div className="flex h-1.5 rounded-full overflow-hidden bg-muted gap-px">
					<div
						className="rounded-l-full transition-all duration-500"
						style={{
							width: `${(totalBids / totalMax) * 100}%`,
							backgroundColor: BID_COLOR,
							opacity: totalBids > 0 ? 1 : 0.2,
						}}
					/>
					<div
						className="rounded-r-full transition-all duration-500"
						style={{
							width: `${(totalAsks / totalMax) * 100}%`,
							backgroundColor: ASK_COLOR,
							opacity: totalAsks > 0 ? 1 : 0.2,
						}}
					/>
				</div>

				{/* Best bid/ask */}
				<div className="flex justify-between mt-2">
					<span className="font-mono text-[9px]" style={{ color: BID_COLOR }}>
						{bestBid > 0 ? `BEST $${formatPrice(bestBid)}` : "—"}
					</span>
					<span className="font-mono text-[9px]" style={{ color: ASK_COLOR }}>
						{bestAsk > 0 ? `BEST $${formatPrice(bestAsk)}` : "—"}
					</span>
				</div>
			</div>

			{/* Orders by task class */}
			{(bidsByTask.length > 0 || asksByTask.length > 0) && (
				<div className="px-4 py-3 border-b border-border">
					<div className="font-mono text-[10px] text-muted-foreground tracking-[0.5px] mb-2">BY TASK</div>

					{bidsByTask.length > 0 && (
						<div className="mb-2">
							<div className="font-mono text-[9px] text-muted-foreground/50 mb-1">INTENTS</div>
							{bidsByTask.map(([task, { count, volume }]) => {
								const maxCount = bidsByTask[0]?.[1].count ?? 1
								return (
									<div key={task} className="flex items-center gap-2 py-0.5">
										<span className="font-mono text-[9px] text-muted-foreground w-14 shrink-0">{task}</span>
										<div className="flex-1 h-1 bg-muted rounded-full overflow-hidden">
											<div
												className="h-full rounded-full transition-all duration-500"
												style={{
													width: `${(count / maxCount) * 100}%`,
													backgroundColor: BID_COLOR,
												}}
											/>
										</div>
										<span className="font-mono text-[9px] text-muted-foreground w-4 text-right">{count}</span>
									</div>
								)
							})}
						</div>
					)}

					{asksByTask.length > 0 && (
						<div>
							<div className="font-mono text-[9px] text-muted-foreground/50 mb-1">SOLVERS</div>
							{asksByTask.map(([task, count]) => {
								const maxCount = asksByTask[0]?.[1] ?? 1
								return (
									<div key={task} className="flex items-center gap-2 py-0.5">
										<span className="font-mono text-[9px] text-muted-foreground w-14 shrink-0">{task}</span>
										<div className="flex-1 h-1 bg-muted rounded-full overflow-hidden">
											<div
												className="h-full rounded-full transition-all duration-500"
												style={{
													width: `${(count / maxCount) * 100}%`,
													backgroundColor: ASK_COLOR,
												}}
											/>
										</div>
										<span className="font-mono text-[9px] text-muted-foreground w-4 text-right">{count}</span>
									</div>
								)
							})}
						</div>
					)}
				</div>
			)}

			{/* Match activity sparkline */}
			<div className="px-4 py-3">
				<div className="flex items-center justify-between mb-2">
					<span className="font-mono text-[10px] text-muted-foreground tracking-[0.5px]">ACTIVITY</span>
					<span className="font-mono text-[9px] text-muted-foreground/50">2M</span>
				</div>
				<div ref={sparkContainerRef} className="h-12">
					<canvas ref={sparkRef} className="w-full h-full" />
				</div>
			</div>
		</div>
	)
}
