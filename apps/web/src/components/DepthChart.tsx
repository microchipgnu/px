import type { BuyOrder, SellOrder } from "@payload-exchange/protocol"
import type { MatchTick } from "@/hooks/useSimulation"
import { formatPrice } from "@/lib/format"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"

type Props = {
	buyOrders: BuyOrder[]
	sellOrders: SellOrder[]
	matchHistory: MatchTick[]
}

const BID_COLOR = "#0d9488"
const ASK_COLOR = "#ef4444"
const GRID_COLOR = "#1C2123"
const LABEL_COLOR = "#555A5A"

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

type TimeWindow = { label: string; ms: number; buckets: number }
const TIME_WINDOWS: TimeWindow[] = [
	{ label: "1M", ms: 60_000, buckets: 20 },
	{ label: "5M", ms: 300_000, buckets: 25 },
	{ label: "15M", ms: 900_000, buckets: 30 },
	{ label: "1H", ms: 3_600_000, buckets: 36 },
]

type ChartView = "volume" | "depth" | "tasks"

function bucketVolume(history: MatchTick[], windowMs: number, count: number) {
	if (history.length === 0) return []
	const now = Date.now()
	const start = now - windowMs
	const bucketMs = windowMs / count
	const buckets: number[] = new Array(count).fill(0)
	for (const tick of history) {
		if (tick.t < start) continue
		const idx = Math.min(Math.floor((tick.t - start) / bucketMs), count - 1)
		buckets[idx] += tick.price
	}
	return buckets
}

function bucketCounts(history: MatchTick[], windowMs: number, count: number) {
	if (history.length === 0) return []
	const now = Date.now()
	const start = now - windowMs
	const bucketMs = windowMs / count
	const buckets: number[] = new Array(count).fill(0)
	for (const tick of history) {
		if (tick.t < start) continue
		const idx = Math.min(Math.floor((tick.t - start) / bucketMs), count - 1)
		buckets[idx] += 1
	}
	return buckets
}

export function DepthChart({ buyOrders, sellOrders, matchHistory }: Props) {
	const [timeWindow, setTimeWindow] = useState<TimeWindow>(TIME_WINDOWS[1])
	const [chartView, setChartView] = useState<ChartView>("volume")
	const [fullscreen, setFullscreen] = useState(false)
	const chartRef = useRef<HTMLCanvasElement>(null)
	const chartContainerRef = useRef<HTMLDivElement>(null)

	const volBuckets = useMemo(() => bucketVolume(matchHistory, timeWindow.ms, timeWindow.buckets), [matchHistory, timeWindow])
	const countBuckets = useMemo(() => bucketCounts(matchHistory, timeWindow.ms, timeWindow.buckets), [matchHistory, timeWindow])

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

	const bestBid = useMemo(() => buyOrders.length === 0 ? 0 : Math.max(...buyOrders.map((o) => o.maxPrice)), [buyOrders])
	const bestAsk = useMemo(() => sellOrders.length === 0 ? 0 : Math.min(...sellOrders.map((o) => o.price)), [sellOrders])
	const totalBids = buyOrders.length
	const totalAsks = sellOrders.length
	const totalMax = Math.max(totalBids, totalAsks, 1)
	const totalVol = useMemo(() => volBuckets.reduce((s, v) => s + v, 0), [volBuckets])
	const totalTxns = useMemo(() => countBuckets.reduce((s, v) => s + v, 0), [countBuckets])

	// Draw chart
	const drawChart = useCallback(() => {
		const canvas = chartRef.current
		const container = chartContainerRef.current
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

		const data = chartView === "volume" ? volBuckets : countBuckets
		if (data.length === 0) {
			ctx.fillStyle = LABEL_COLOR
			ctx.font = "10px 'Geist Mono', monospace"
			ctx.textAlign = "center"
			ctx.fillText("NO DATA", w / 2, h / 2 + 4)
			return
		}

		const maxVal = Math.max(...data, 0.001)
		const padB = 16
		const padT = 4
		const chartH = h - padB - padT
		const gap = fullscreen ? 3 : 2
		const barW = Math.max((w - gap * (data.length - 1)) / data.length, 2)

		// Grid lines
		ctx.strokeStyle = GRID_COLOR
		ctx.lineWidth = 1
		for (let i = 1; i <= 3; i++) {
			const y = padT + chartH - (chartH * i) / 4
			ctx.beginPath()
			ctx.moveTo(0, Math.round(y) + 0.5)
			ctx.lineTo(w, Math.round(y) + 0.5)
			ctx.stroke()
		}

		// Bars
		for (let i = 0; i < data.length; i++) {
			const val = data[i]
			if (val === 0) continue
			const barH = Math.max((val / maxVal) * chartH, 1)
			const x = i * (barW + gap)
			const y = padT + chartH - barH

			const alpha = 0.3 + (i / data.length) * 0.6
			ctx.fillStyle = BID_COLOR
			ctx.globalAlpha = alpha
			ctx.beginPath()
			ctx.roundRect(x, y, barW, barH, fullscreen ? 2 : 1)
			ctx.fill()
		}
		ctx.globalAlpha = 1

		// X-axis labels
		ctx.font = "8px 'Geist Mono', monospace"
		ctx.fillStyle = LABEL_COLOR
		ctx.textAlign = "left"
		ctx.fillText(`-${timeWindow.label}`, 2, h - 2)
		ctx.textAlign = "right"
		ctx.fillText("NOW", w - 2, h - 2)
	}, [volBuckets, countBuckets, chartView, timeWindow, fullscreen])

	useEffect(() => { drawChart() }, [drawChart])

	const content = (
		<div className={`flex flex-col overflow-y-auto bg-card ${fullscreen ? "h-full" : ""}`}>
			{/* Header */}
			<div className="px-4 py-2 border-b border-border flex items-center gap-2 shrink-0">
				<span className="font-mono text-[10px] font-semibold text-muted-foreground tracking-[0.5px]">
					MARKET DEPTH
				</span>
				<button
					type="button"
					onClick={() => setFullscreen(!fullscreen)}
					className="ml-auto font-mono text-[9px] text-muted-foreground/40 hover:text-muted-foreground transition-colors px-1"
					title={fullscreen ? "Exit fullscreen" : "Fullscreen"}
				>
					{fullscreen ? "✕" : "⛶"}
				</button>
			</div>

			{/* Summary stats */}
			<div className="px-4 py-2.5 border-b border-border">
				<div className="flex items-center gap-2 mb-1.5">
					<span className="size-1.5 rounded-full" style={{ backgroundColor: BID_COLOR }} />
					<span className="font-mono text-[10px] text-muted-foreground">BIDS</span>
					<span className="font-mono text-[11px] text-foreground ml-auto">{totalBids}</span>
				</div>
				<div className="flex items-center gap-2 mb-2">
					<span className="size-1.5 rounded-full" style={{ backgroundColor: ASK_COLOR }} />
					<span className="font-mono text-[10px] text-muted-foreground">ASKS</span>
					<span className="font-mono text-[11px] text-foreground ml-auto">{totalAsks}</span>
				</div>

				{/* Balance bar */}
				<div className="flex h-1.5 rounded-full overflow-hidden bg-muted gap-px">
					<div className="rounded-l-full transition-all duration-500" style={{ width: `${(totalBids / totalMax) * 100}%`, backgroundColor: BID_COLOR, opacity: totalBids > 0 ? 1 : 0.2 }} />
					<div className="rounded-r-full transition-all duration-500" style={{ width: `${(totalAsks / totalMax) * 100}%`, backgroundColor: ASK_COLOR, opacity: totalAsks > 0 ? 1 : 0.2 }} />
				</div>

				<div className="flex justify-between mt-1.5">
					<span className="font-mono text-[9px]" style={{ color: BID_COLOR }}>{bestBid > 0 ? `BEST $${formatPrice(bestBid)}` : "—"}</span>
					<span className="font-mono text-[9px]" style={{ color: ASK_COLOR }}>{bestAsk > 0 ? `BEST $${formatPrice(bestAsk)}` : "—"}</span>
				</div>
			</div>

			{/* Chart controls */}
			<div className="px-4 py-2 border-b border-border flex items-center gap-1 shrink-0">
				{/* View toggle */}
				<div className="flex items-center gap-0 bg-muted rounded-[2px] mr-2">
					{(["volume", "depth"] as const).map((v) => (
						<button
							key={v}
							type="button"
							onClick={() => setChartView(v)}
							className={`px-2 py-0.5 font-mono text-[9px] font-medium tracking-[0.5px] rounded-[2px] transition-all ${
								chartView === v ? "bg-foreground/10 text-foreground" : "text-muted-foreground/40 hover:text-muted-foreground"
							}`}
						>
							{v === "volume" ? "VOL" : "TXNS"}
						</button>
					))}
				</div>

				{/* Time window */}
				{TIME_WINDOWS.map((tw) => (
					<button
						key={tw.label}
						type="button"
						onClick={() => setTimeWindow(tw)}
						className={`px-1.5 py-0.5 font-mono text-[9px] font-medium tracking-[0.5px] rounded-[2px] transition-all ${
							timeWindow.label === tw.label ? "text-foreground bg-foreground/10" : "text-muted-foreground/30 hover:text-muted-foreground"
						}`}
					>
						{tw.label}
					</button>
				))}

				{/* Stats */}
				<div className="ml-auto flex items-center gap-3">
					<span className="font-mono text-[9px] text-muted-foreground/40">
						{chartView === "volume" ? `$${formatPrice(totalVol)}` : `${totalTxns} txns`}
					</span>
				</div>
			</div>

			{/* Chart canvas */}
			<div ref={chartContainerRef} className={fullscreen ? "flex-1 min-h-0" : "h-24"}>
				<canvas ref={chartRef} className="w-full h-full" />
			</div>

			{/* Task breakdown */}
			{(bidsByTask.length > 0 || asksByTask.length > 0) && (
				<div className="px-4 py-2.5 border-t border-border">
					<div className="font-mono text-[9px] text-muted-foreground/50 tracking-[0.5px] mb-1.5">BY TASK</div>

					{asksByTask.length > 0 && (
						<div className={bidsByTask.length > 0 ? "mb-2" : ""}>
							{asksByTask.map(([task, count]) => {
								const maxCount = asksByTask[0]?.[1] ?? 1
								return (
									<div key={task} className="flex items-center gap-2 py-0.5">
										<span className="font-mono text-[8px] text-muted-foreground/50 w-14 shrink-0">{task}</span>
										<div className="flex-1 h-1 bg-muted rounded-full overflow-hidden">
											<div className="h-full rounded-full transition-all duration-500" style={{ width: `${(count / maxCount) * 100}%`, backgroundColor: ASK_COLOR }} />
										</div>
										<span className="font-mono text-[8px] text-muted-foreground/40 w-4 text-right">{count}</span>
									</div>
								)
							})}
						</div>
					)}

					{bidsByTask.length > 0 && bidsByTask.map(([task, { count }]) => {
						const maxCount = bidsByTask[0]?.[1].count ?? 1
						return (
							<div key={task} className="flex items-center gap-2 py-0.5">
								<span className="font-mono text-[8px] text-muted-foreground/50 w-14 shrink-0">{task}</span>
								<div className="flex-1 h-1 bg-muted rounded-full overflow-hidden">
									<div className="h-full rounded-full transition-all duration-500" style={{ width: `${(count / maxCount) * 100}%`, backgroundColor: BID_COLOR }} />
								</div>
								<span className="font-mono text-[8px] text-muted-foreground/40 w-4 text-right">{count}</span>
							</div>
						)
					})}
				</div>
			)}
		</div>
	)

	if (fullscreen) {
		return (
			<div className="fixed inset-0 z-50 bg-background/95 backdrop-blur-sm flex flex-col">
				{content}
			</div>
		)
	}

	return content
}
