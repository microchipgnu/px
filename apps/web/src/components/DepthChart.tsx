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
const BID_GLOW = "rgba(13, 148, 136, 0.12)"
const ASK_COLOR = "#ef4444"
const GRID_COLOR = "#1a1f21"
const GRID_COLOR_STRONG = "#242a2c"
const LABEL_COLOR = "#4a5055"
const TEXT_COLOR = "#8a8f8f"
const CROSSHAIR_COLOR = "#3a4045"
const TOOLTIP_BG = "#0d1416"
const TOOLTIP_BORDER = "#2a3035"
const ACCENT = "#22c55e"

const TASK_LABELS: Record<string, string> = {
	onchain_swap: "SWAP", bridge: "BRIDGE", yield: "YIELD", price_feed: "FEED",
	search: "SEARCH", computation: "COMPUTE", monitoring: "MONITOR", smart_contract: "CONTRACT",
}

type TimeWindow = { label: string; ms: number; buckets: number }
const TIME_WINDOWS: TimeWindow[] = [
	{ label: "1M", ms: 60_000, buckets: 20 },
	{ label: "5M", ms: 300_000, buckets: 30 },
	{ label: "15M", ms: 900_000, buckets: 30 },
	{ label: "1H", ms: 3_600_000, buckets: 36 },
	{ label: "4H", ms: 14_400_000, buckets: 48 },
]

type ChartType = "area" | "bars" | "line" | "candles"
type ChartMetric = "volume" | "txns" | "cumulative"

function bucketData(history: MatchTick[], windowMs: number, count: number) {
	const now = Date.now()
	const start = now - windowMs
	const bucketMs = windowMs / count
	const volumes: number[] = new Array(count).fill(0)
	const counts: number[] = new Array(count).fill(0)
	const highs: number[] = new Array(count).fill(0)
	const lows: number[] = new Array(count).fill(Infinity)
	const opens: number[] = new Array(count).fill(0)
	const closes: number[] = new Array(count).fill(0)

	for (const tick of history) {
		if (tick.t < start) continue
		const idx = Math.min(Math.floor((tick.t - start) / bucketMs), count - 1)
		volumes[idx] += tick.price
		counts[idx] += 1
		if (highs[idx] < tick.price) highs[idx] = tick.price
		if (lows[idx] > tick.price) lows[idx] = tick.price
		if (opens[idx] === 0) opens[idx] = tick.price
		closes[idx] = tick.price
	}

	// Fix lows for empty buckets
	for (let i = 0; i < count; i++) {
		if (lows[i] === Infinity) lows[i] = 0
	}

	// Cumulative
	const cumulative: number[] = []
	let cum = 0
	for (let i = 0; i < count; i++) {
		cum += volumes[i]
		cumulative.push(cum)
	}

	return { volumes, counts, highs, lows, opens, closes, cumulative }
}

export function DepthChart({ buyOrders, sellOrders, matchHistory }: Props) {
	const [timeWindow, setTimeWindow] = useState<TimeWindow>(TIME_WINDOWS[1])
	const [chartType, setChartType] = useState<ChartType>("area")
	const [chartMetric, setChartMetric] = useState<ChartMetric>("volume")
	const [fullscreen, setFullscreen] = useState(false)
	const [hover, setHover] = useState<{ x: number; y: number } | null>(null)
	const chartRef = useRef<HTMLCanvasElement>(null)
	const chartContainerRef = useRef<HTMLDivElement>(null)

	const data = useMemo(() => bucketData(matchHistory, timeWindow.ms, timeWindow.buckets), [matchHistory, timeWindow])

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

	const series = useMemo(() => {
		if (chartMetric === "volume") return data.volumes
		if (chartMetric === "txns") return data.counts
		return data.cumulative
	}, [data, chartMetric])

	const totalVal = useMemo(() => series.reduce((s, v) => s + v, 0), [series])

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

		const padL = fullscreen ? 52 : 36
		const padR = fullscreen ? 12 : 8
		const padT = 8
		const padB = fullscreen ? 24 : 18
		const cw = w - padL - padR
		const ch = h - padT - padB

		const maxVal = Math.max(...series, 0.001)
		const toX = (i: number) => padL + (i / (series.length - 1 || 1)) * cw
		const toY = (v: number) => padT + ch - (v / maxVal) * ch

		// Grid
		ctx.font = `${fullscreen ? 9 : 8}px 'Geist Mono', monospace`
		const yTicks = fullscreen ? 5 : 3
		for (let i = 0; i <= yTicks; i++) {
			const val = (maxVal / yTicks) * i
			const y = toY(val)
			ctx.strokeStyle = i === 0 ? GRID_COLOR_STRONG : GRID_COLOR
			ctx.lineWidth = 1
			ctx.beginPath()
			ctx.moveTo(padL, Math.round(y) + 0.5)
			ctx.lineTo(w - padR, Math.round(y) + 0.5)
			ctx.stroke()

			if (i > 0) {
				ctx.fillStyle = LABEL_COLOR
				ctx.textAlign = "right"
				const label = chartMetric === "txns" ? String(Math.round(val)) : `$${formatPrice(val)}`
				ctx.fillText(label, padL - 4, y + 3)
			}
		}

		// X-axis time labels
		ctx.fillStyle = LABEL_COLOR
		ctx.textAlign = "left"
		ctx.fillText(`-${timeWindow.label}`, padL, h - 2)
		ctx.textAlign = "center"
		ctx.fillText(`-${timeWindow.label.replace(/(\d+)/, (_, n) => String(Math.round(Number(n) / 2)))}`, padL + cw / 2, h - 2)
		ctx.textAlign = "right"
		ctx.fillText("NOW", w - padR, h - 2)

		if (series.length === 0 || maxVal <= 0.001) {
			ctx.fillStyle = LABEL_COLOR
			ctx.font = "10px 'Geist Mono', monospace"
			ctx.textAlign = "center"
			ctx.fillText("NO DATA", w / 2, h / 2)
			return
		}

		if (chartType === "bars" || chartType === "candles") {
			const gap = fullscreen ? 2 : 1
			const barW = Math.max((cw - gap * (series.length - 1)) / series.length, 2)

			for (let i = 0; i < series.length; i++) {
				const val = series[i]
				if (val === 0) continue
				const barH = Math.max((val / maxVal) * ch, 1)
				const x = padL + i * (barW + gap)
				const y = padT + ch - barH

				if (chartType === "candles" && data.opens[i] > 0) {
					const isUp = data.closes[i] >= data.opens[i]
					ctx.fillStyle = isUp ? BID_COLOR : ASK_COLOR
					ctx.globalAlpha = 0.7
					// Wick
					const wickX = x + barW / 2
					const highY = toY(data.highs[i])
					const lowY = toY(data.lows[i])
					ctx.beginPath()
					ctx.moveTo(wickX, highY)
					ctx.lineTo(wickX, lowY)
					ctx.strokeStyle = isUp ? BID_COLOR : ASK_COLOR
					ctx.lineWidth = 1
					ctx.stroke()
					// Body
					const openY = toY(data.opens[i])
					const closeY = toY(data.closes[i])
					const bodyTop = Math.min(openY, closeY)
					const bodyH = Math.max(Math.abs(openY - closeY), 1)
					ctx.beginPath()
					ctx.roundRect(x, bodyTop, barW, bodyH, 1)
					ctx.fill()
				} else {
					ctx.fillStyle = BID_COLOR
					ctx.globalAlpha = 0.25 + (i / series.length) * 0.55
					ctx.beginPath()
					ctx.roundRect(x, y, barW, barH, fullscreen ? 2 : 1)
					ctx.fill()
				}
			}
			ctx.globalAlpha = 1
		}

		if (chartType === "area" || chartType === "line") {
			// Area fill
			if (chartType === "area") {
				ctx.beginPath()
				ctx.moveTo(toX(0), toY(0))
				for (let i = 0; i < series.length; i++) {
					ctx.lineTo(toX(i), toY(series[i]))
				}
				ctx.lineTo(toX(series.length - 1), toY(0))
				ctx.closePath()
				const grad = ctx.createLinearGradient(0, padT, 0, padT + ch)
				grad.addColorStop(0, "rgba(13, 148, 136, 0.20)")
				grad.addColorStop(1, "rgba(13, 148, 136, 0.01)")
				ctx.fillStyle = grad
				ctx.fill()
			}

			// Line
			ctx.beginPath()
			for (let i = 0; i < series.length; i++) {
				const x = toX(i)
				const y = toY(series[i])
				if (i === 0) ctx.moveTo(x, y)
				else ctx.lineTo(x, y)
			}
			ctx.strokeStyle = BID_COLOR
			ctx.lineWidth = fullscreen ? 2 : 1.5
			ctx.lineJoin = "round"
			ctx.stroke()

			// Dots at data points (fullscreen only)
			if (fullscreen) {
				for (let i = 0; i < series.length; i++) {
					if (series[i] === 0) continue
					ctx.beginPath()
					ctx.arc(toX(i), toY(series[i]), 2, 0, Math.PI * 2)
					ctx.fillStyle = BID_COLOR
					ctx.fill()
				}
			}
		}

		// Crosshair + tooltip
		if (hover && hover.x >= padL && hover.x <= w - padR && hover.y >= padT && hover.y <= padT + ch) {
			const { x, y } = hover

			// Vertical line
			ctx.strokeStyle = CROSSHAIR_COLOR
			ctx.lineWidth = 1
			ctx.setLineDash([3, 3])
			ctx.beginPath()
			ctx.moveTo(x, padT)
			ctx.lineTo(x, padT + ch)
			ctx.stroke()

			// Horizontal line
			ctx.beginPath()
			ctx.moveTo(padL, y)
			ctx.lineTo(w - padR, y)
			ctx.stroke()
			ctx.setLineDash([])

			// Find nearest bucket
			const bucketIdx = Math.round(((x - padL) / cw) * (series.length - 1))
			const clampedIdx = Math.max(0, Math.min(series.length - 1, bucketIdx))
			const val = series[clampedIdx]
			const txns = data.counts[clampedIdx]
			const vol = data.volumes[clampedIdx]

			// Snap dot
			if (val > 0 && (chartType === "area" || chartType === "line")) {
				const snapX = toX(clampedIdx)
				const snapY = toY(val)
				ctx.beginPath()
				ctx.arc(snapX, snapY, 4, 0, Math.PI * 2)
				ctx.fillStyle = TOOLTIP_BG
				ctx.fill()
				ctx.beginPath()
				ctx.arc(snapX, snapY, 3, 0, Math.PI * 2)
				ctx.fillStyle = BID_COLOR
				ctx.fill()
			}

			// Tooltip
			const bucketTime = Date.now() - timeWindow.ms + (clampedIdx / series.length) * timeWindow.ms
			const timeStr = new Date(bucketTime).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false })

			const lines = [
				timeStr,
				`Vol: $${formatPrice(vol)}`,
				`Txns: ${txns}`,
			]

			ctx.font = `${fullscreen ? 10 : 9}px 'Geist Mono', monospace`
			const lineH = fullscreen ? 15 : 13
			const tooltipW = Math.max(...lines.map((l) => ctx.measureText(l).width)) + 16
			const tooltipH = lines.length * lineH + 10
			let tx = Math.min(x + 12, w - padR - tooltipW)
			if (tx < padL) tx = padL
			let ty = Math.max(y - tooltipH - 8, padT)

			ctx.fillStyle = TOOLTIP_BG
			ctx.strokeStyle = TOOLTIP_BORDER
			ctx.lineWidth = 1
			ctx.beginPath()
			ctx.roundRect(tx, ty, tooltipW, tooltipH, 3)
			ctx.fill()
			ctx.stroke()

			ctx.fillStyle = TEXT_COLOR
			ctx.textAlign = "left"
			for (let i = 0; i < lines.length; i++) {
				const color = i === 0 ? BID_COLOR : TEXT_COLOR
				ctx.fillStyle = color
				ctx.fillText(lines[i], tx + 8, ty + 12 + i * lineH)
			}
		}
	}, [series, data, chartType, chartMetric, timeWindow, fullscreen, hover])

	useEffect(() => { drawChart() }, [drawChart])

	const handleMouseMove = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
		const rect = e.currentTarget.getBoundingClientRect()
		setHover({ x: e.clientX - rect.left, y: e.clientY - rect.top })
	}, [])

	const handleMouseLeave = useCallback(() => setHover(null), [])

	// Keyboard: Escape exits fullscreen
	useEffect(() => {
		if (!fullscreen) return
		const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setFullscreen(false) }
		window.addEventListener("keydown", onKey)
		return () => window.removeEventListener("keydown", onKey)
	}, [fullscreen])

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
					title={fullscreen ? "Exit fullscreen (Esc)" : "Fullscreen"}
				>
					{fullscreen ? "✕ ESC" : "⛶"}
				</button>
			</div>

			{/* Summary stats (compact in sidebar, expanded in fullscreen) */}
			<div className={`px-4 border-b border-border ${fullscreen ? "py-3 flex items-center gap-6" : "py-2"}`}>
				{fullscreen ? (
					<>
						<div className="flex items-center gap-2">
							<span className="size-2 rounded-full" style={{ backgroundColor: BID_COLOR }} />
							<span className="font-mono text-xs text-muted-foreground">BIDS</span>
							<span className="font-mono text-sm text-foreground font-medium">{totalBids}</span>
							{bestBid > 0 && <span className="font-mono text-xs" style={{ color: BID_COLOR }}>BEST ${formatPrice(bestBid)}</span>}
						</div>
						<div className="flex items-center gap-2">
							<span className="size-2 rounded-full" style={{ backgroundColor: ASK_COLOR }} />
							<span className="font-mono text-xs text-muted-foreground">ASKS</span>
							<span className="font-mono text-sm text-foreground font-medium">{totalAsks}</span>
							{bestAsk > 0 && <span className="font-mono text-xs" style={{ color: ASK_COLOR }}>BEST ${formatPrice(bestAsk)}</span>}
						</div>
						<div className="flex h-2 rounded-full overflow-hidden bg-muted gap-px w-32">
							<div className="rounded-l-full" style={{ width: `${(totalBids / totalMax) * 100}%`, backgroundColor: BID_COLOR, opacity: totalBids > 0 ? 1 : 0.2 }} />
							<div className="rounded-r-full" style={{ width: `${(totalAsks / totalMax) * 100}%`, backgroundColor: ASK_COLOR, opacity: totalAsks > 0 ? 1 : 0.2 }} />
						</div>
					</>
				) : (
					<>
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
						<div className="flex h-1.5 rounded-full overflow-hidden bg-muted gap-px">
							<div className="rounded-l-full transition-all duration-500" style={{ width: `${(totalBids / totalMax) * 100}%`, backgroundColor: BID_COLOR, opacity: totalBids > 0 ? 1 : 0.2 }} />
							<div className="rounded-r-full transition-all duration-500" style={{ width: `${(totalAsks / totalMax) * 100}%`, backgroundColor: ASK_COLOR, opacity: totalAsks > 0 ? 1 : 0.2 }} />
						</div>
						<div className="flex justify-between mt-1.5">
							<span className="font-mono text-[9px]" style={{ color: BID_COLOR }}>{bestBid > 0 ? `BEST $${formatPrice(bestBid)}` : "—"}</span>
							<span className="font-mono text-[9px]" style={{ color: ASK_COLOR }}>{bestAsk > 0 ? `BEST $${formatPrice(bestAsk)}` : "—"}</span>
						</div>
					</>
				)}
			</div>

			{/* Chart toolbar */}
			<div className={`px-4 border-b border-border flex items-center gap-1 shrink-0 ${fullscreen ? "py-2" : "py-1.5"}`}>
				{/* Chart type */}
				<div className="flex items-center gap-0 bg-muted rounded-[2px] mr-1">
					{(["area", "bars", "line", "candles"] as const).map((t) => (
						<button key={t} type="button" onClick={() => setChartType(t)}
							className={`px-1.5 py-0.5 font-mono text-[9px] font-medium tracking-[0.5px] rounded-[2px] transition-all ${
								chartType === t ? "bg-foreground/10 text-foreground" : "text-muted-foreground/30 hover:text-muted-foreground"
							}`}
						>
							{t === "area" ? "▤" : t === "bars" ? "▥" : t === "line" ? "⌇" : "⊞"}
						</button>
					))}
				</div>

				{/* Metric */}
				<div className="flex items-center gap-0 bg-muted rounded-[2px] mr-1">
					{(["volume", "txns", "cumulative"] as const).map((m) => (
						<button key={m} type="button" onClick={() => setChartMetric(m)}
							className={`px-1.5 py-0.5 font-mono text-[9px] font-medium tracking-[0.5px] rounded-[2px] transition-all ${
								chartMetric === m ? "bg-foreground/10 text-foreground" : "text-muted-foreground/30 hover:text-muted-foreground"
							}`}
						>
							{m === "volume" ? "VOL" : m === "txns" ? "TXN" : "CUM"}
						</button>
					))}
				</div>

				{/* Divider */}
				<span className="text-muted-foreground/10 mx-0.5">|</span>

				{/* Time windows */}
				{TIME_WINDOWS.map((tw) => (
					<button key={tw.label} type="button" onClick={() => setTimeWindow(tw)}
						className={`px-1.5 py-0.5 font-mono text-[9px] font-medium tracking-[0.5px] rounded-[2px] transition-all ${
							timeWindow.label === tw.label ? "text-foreground bg-foreground/10" : "text-muted-foreground/30 hover:text-muted-foreground"
						}`}
					>
						{tw.label}
					</button>
				))}

				{/* Summary */}
				<span className="ml-auto font-mono text-[9px] text-muted-foreground/40">
					{chartMetric === "volume" ? `$${formatPrice(totalVal)}` : chartMetric === "txns" ? `${totalVal} txns` : `$${formatPrice(totalVal)}`}
				</span>
			</div>

			{/* Chart */}
			<div ref={chartContainerRef} className={fullscreen ? "flex-1 min-h-0" : "h-28"}>
				<canvas
					ref={chartRef}
					className="w-full h-full cursor-crosshair"
					onMouseMove={handleMouseMove}
					onMouseLeave={handleMouseLeave}
				/>
			</div>

			{/* Task breakdown */}
			{(bidsByTask.length > 0 || asksByTask.length > 0) && (
				<div className={`px-4 border-t border-border ${fullscreen ? "py-3" : "py-2"}`}>
					<div className="font-mono text-[9px] text-muted-foreground/50 tracking-[0.5px] mb-1.5">BY TASK</div>
					<div className={fullscreen ? "grid grid-cols-2 gap-x-6 gap-y-0.5" : ""}>
						{asksByTask.map(([task, count]) => {
							const maxCount = asksByTask[0]?.[1] ?? 1
							return (
								<div key={`ask-${task}`} className="flex items-center gap-2 py-0.5">
									<span className="font-mono text-[8px] text-muted-foreground/50 w-14 shrink-0">{task}</span>
									<div className="flex-1 h-1 bg-muted rounded-full overflow-hidden">
										<div className="h-full rounded-full transition-all duration-500" style={{ width: `${(count / maxCount) * 100}%`, backgroundColor: ASK_COLOR }} />
									</div>
									<span className="font-mono text-[8px] text-muted-foreground/40 w-4 text-right">{count}</span>
								</div>
							)
						})}
						{bidsByTask.map(([task, { count }]) => {
							const maxCount = bidsByTask[0]?.[1].count ?? 1
							return (
								<div key={`bid-${task}`} className="flex items-center gap-2 py-0.5">
									<span className="font-mono text-[8px] text-muted-foreground/50 w-14 shrink-0">{task}</span>
									<div className="flex-1 h-1 bg-muted rounded-full overflow-hidden">
										<div className="h-full rounded-full transition-all duration-500" style={{ width: `${(count / maxCount) * 100}%`, backgroundColor: BID_COLOR }} />
									</div>
									<span className="font-mono text-[8px] text-muted-foreground/40 w-4 text-right">{count}</span>
								</div>
							)
						})}
					</div>
				</div>
			)}
		</div>
	)

	if (fullscreen) {
		return (
			<div className="fixed inset-0 z-50 bg-background/98 backdrop-blur-sm flex flex-col">
				{content}
			</div>
		)
	}

	return content
}
