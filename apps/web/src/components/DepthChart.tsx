import type { BuyOrder, SellOrder } from "@payload-exchange/protocol"
import type { MatchTick } from "@/hooks/useSimulation"
import { formatPrice } from "@/lib/format"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"

type Props = {
	buyOrders: BuyOrder[]
	sellOrders: SellOrder[]
	matchHistory: MatchTick[]
}

const BID = "#0d9488"
const ASK = "#ef4444"
const GRID = "#1a1f21"
const MUTED = "#3a4045"
const LABEL = "#555a5a"
const TEXT = "#8a8f8f"

const TASK_LABELS: Record<string, string> = {
	onchain_swap: "SWAP", bridge: "BRIDGE", yield: "YIELD", price_feed: "FEED",
	search: "SEARCH", computation: "COMPUTE", monitoring: "MONITOR", smart_contract: "CONTRACT",
}

type TimeWindow = { label: string; ms: number; buckets: number }
const WINDOWS: TimeWindow[] = [
	{ label: "1M", ms: 60_000, buckets: 20 },
	{ label: "5M", ms: 300_000, buckets: 25 },
	{ label: "15M", ms: 900_000, buckets: 30 },
	{ label: "1H", ms: 3_600_000, buckets: 36 },
]

type ChartMode = "vol" | "txns"

function bucket(history: MatchTick[], windowMs: number, count: number) {
	const now = Date.now()
	const start = now - windowMs
	const bMs = windowMs / count
	const vols = new Array(count).fill(0)
	const cnts = new Array(count).fill(0)
	for (const t of history) {
		if (t.t < start) continue
		const i = Math.min(Math.floor((t.t - start) / bMs), count - 1)
		vols[i] += t.price
		cnts[i] += 1
	}
	return { vols, cnts }
}

export function DepthChart({ buyOrders, sellOrders, matchHistory }: Props) {
	const [tw, setTw] = useState<TimeWindow>(WINDOWS[1])
	const [mode, setMode] = useState<ChartMode>("vol")
	const [fullscreen, setFullscreen] = useState(false)
	const [hover, setHover] = useState<{ x: number; y: number } | null>(null)
	const canvasRef = useRef<HTMLCanvasElement>(null)
	const containerRef = useRef<HTMLDivElement>(null)

	const { vols, cnts } = useMemo(() => bucket(matchHistory, tw.ms, tw.buckets), [matchHistory, tw])
	const series = mode === "vol" ? vols : cnts

	const asksByTask = useMemo(() => {
		const m = new Map<string, number>()
		for (const o of sellOrders) for (const tc of o.supportedTaskClasses) {
			const l = TASK_LABELS[tc] ?? tc
			m.set(l, (m.get(l) ?? 0) + 1)
		}
		return [...m.entries()].sort((a, b) => b[1] - a[1])
	}, [sellOrders])

	const totalBids = buyOrders.length
	const totalAsks = sellOrders.length
	const totalMax = Math.max(totalBids, totalAsks, 1)
	const bestBid = useMemo(() => buyOrders.length === 0 ? 0 : Math.max(...buyOrders.map(o => o.maxPrice)), [buyOrders])
	const bestAsk = useMemo(() => sellOrders.length === 0 ? 0 : Math.min(...sellOrders.map(o => o.price)), [sellOrders])

	// Draw
	const draw = useCallback(() => {
		const canvas = canvasRef.current
		const box = containerRef.current
		if (!canvas || !box) return
		const dpr = window.devicePixelRatio || 1
		const r = box.getBoundingClientRect()
		const w = r.width, h = r.height
		canvas.width = w * dpr; canvas.height = h * dpr
		canvas.style.width = `${w}px`; canvas.style.height = `${h}px`
		const ctx = canvas.getContext("2d")!
		ctx.scale(dpr, dpr)
		ctx.clearRect(0, 0, w, h)

		const fs = fullscreen
		const pL = fs ? 48 : 0, pR = fs ? 8 : 0, pT = 4, pB = fs ? 20 : 14
		const cw = w - pL - pR, ch = h - pT - pB
		const maxV = Math.max(...series, 0.001)

		// Grid
		ctx.strokeStyle = GRID
		ctx.lineWidth = 1
		const ticks = fs ? 4 : 2
		for (let i = 1; i <= ticks; i++) {
			const y = pT + ch - (ch * i / ticks)
			ctx.beginPath(); ctx.moveTo(pL, Math.round(y) + 0.5); ctx.lineTo(w - pR, Math.round(y) + 0.5); ctx.stroke()
			if (fs) {
				ctx.fillStyle = LABEL; ctx.font = "9px 'Geist Mono', monospace"; ctx.textAlign = "right"
				const v = (maxV * i / ticks)
				ctx.fillText(mode === "vol" ? `$${v < 1 ? v.toFixed(3) : formatPrice(v)}` : String(Math.round(v)), pL - 4, y + 3)
			}
		}

		if (series.every(v => v === 0)) {
			ctx.fillStyle = LABEL; ctx.font = "10px 'Geist Mono', monospace"; ctx.textAlign = "center"
			ctx.fillText("NO ACTIVITY", w / 2, h / 2 + 3)
			return
		}

		// Bars + area line
		const gap = fs ? 2 : 1
		const barW = Math.max((cw - gap * (series.length - 1)) / series.length, 2)

		// Area fill
		ctx.beginPath()
		ctx.moveTo(pL, pT + ch)
		for (let i = 0; i < series.length; i++) {
			const x = pL + i * (barW + gap) + barW / 2
			const y = pT + ch - (series[i] / maxV) * ch
			if (i === 0) ctx.lineTo(x, y); else ctx.lineTo(x, y)
		}
		ctx.lineTo(pL + (series.length - 1) * (barW + gap) + barW / 2, pT + ch)
		ctx.closePath()
		const grad = ctx.createLinearGradient(0, pT, 0, pT + ch)
		grad.addColorStop(0, "rgba(13, 148, 136, 0.12)"); grad.addColorStop(1, "rgba(13, 148, 136, 0.01)")
		ctx.fillStyle = grad; ctx.fill()

		// Line
		ctx.beginPath()
		for (let i = 0; i < series.length; i++) {
			const x = pL + i * (barW + gap) + barW / 2
			const y = pT + ch - (series[i] / maxV) * ch
			if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y)
		}
		ctx.strokeStyle = BID; ctx.lineWidth = fs ? 1.5 : 1; ctx.lineJoin = "round"; ctx.stroke()

		// Bars (subtle behind the line)
		for (let i = 0; i < series.length; i++) {
			if (series[i] === 0) continue
			const barH = Math.max((series[i] / maxV) * ch, 1)
			const x = pL + i * (barW + gap)
			ctx.fillStyle = BID
			ctx.globalAlpha = 0.08 + (i / series.length) * 0.15
			ctx.beginPath(); ctx.roundRect(x, pT + ch - barH, barW, barH, 1); ctx.fill()
		}
		ctx.globalAlpha = 1

		// X labels
		ctx.fillStyle = LABEL; ctx.font = "8px 'Geist Mono', monospace"
		ctx.textAlign = "left"; ctx.fillText(`-${tw.label}`, pL + 2, h - 2)
		ctx.textAlign = "right"; ctx.fillText("NOW", w - pR - 2, h - 2)

		// Crosshair
		if (hover) {
			const { x, y } = hover
			if (x >= pL && x <= w - pR && y >= pT && y <= pT + ch) {
				ctx.setLineDash([2, 2]); ctx.strokeStyle = MUTED; ctx.lineWidth = 1
				ctx.beginPath(); ctx.moveTo(x, pT); ctx.lineTo(x, pT + ch); ctx.stroke()
				ctx.beginPath(); ctx.moveTo(pL, y); ctx.lineTo(w - pR, y); ctx.stroke()
				ctx.setLineDash([])

				const idx = Math.max(0, Math.min(series.length - 1, Math.round(((x - pL) / cw) * (series.length - 1))))
				const val = series[idx]
				const snapX = pL + idx * (barW + gap) + barW / 2
				const snapY = pT + ch - (val / maxV) * ch

				// Snap dot
				if (val > 0) {
					ctx.beginPath(); ctx.arc(snapX, snapY, 3, 0, Math.PI * 2)
					ctx.fillStyle = "#0d1416"; ctx.fill()
					ctx.beginPath(); ctx.arc(snapX, snapY, 2, 0, Math.PI * 2)
					ctx.fillStyle = BID; ctx.fill()
				}

				// Tooltip
				const t = Date.now() - tw.ms + (idx / series.length) * tw.ms
				const tStr = new Date(t).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: false })
				const line = mode === "vol" ? `${tStr}  $${formatPrice(vols[idx])}  ${cnts[idx]}tx` : `${tStr}  ${cnts[idx]}tx  $${formatPrice(vols[idx])}`

				ctx.font = "9px 'Geist Mono', monospace"
				const tw2 = ctx.measureText(line).width + 12
				let tx = Math.min(x + 10, w - pR - tw2)
				if (tx < pL) tx = pL
				const ty = Math.max(y - 22, pT)

				ctx.fillStyle = "#0d1416"; ctx.strokeStyle = "#2a3035"; ctx.lineWidth = 1
				ctx.beginPath(); ctx.roundRect(tx, ty, tw2, 16, 2); ctx.fill(); ctx.stroke()
				ctx.fillStyle = TEXT; ctx.textAlign = "left"
				ctx.fillText(line, tx + 6, ty + 11.5)
			}
		}
	}, [series, vols, cnts, mode, tw, fullscreen, hover])

	useEffect(() => { draw() }, [draw])

	// Esc to close fullscreen
	useEffect(() => {
		if (!fullscreen) return
		const fn = (e: KeyboardEvent) => { if (e.key === "Escape") setFullscreen(false) }
		window.addEventListener("keydown", fn)
		return () => window.removeEventListener("keydown", fn)
	}, [fullscreen])

	const chart = (
		<div className={`flex flex-col ${fullscreen ? "h-full" : ""}`}>
			{/* Header + controls in one row */}
			<div className="px-3 py-1.5 border-b border-border flex items-center gap-1 shrink-0">
				<span className="font-mono text-[10px] font-semibold text-muted-foreground tracking-[0.5px] mr-1">
					MARKET
				</span>

				{/* Mode toggle */}
				<Pill active={mode === "vol"} onClick={() => setMode("vol")}>VOL</Pill>
				<Pill active={mode === "txns"} onClick={() => setMode("txns")}>TXN</Pill>

				<span className="text-border mx-0.5">·</span>

				{/* Time windows */}
				{WINDOWS.map(w => (
					<Pill key={w.label} active={tw.label === w.label} onClick={() => setTw(w)}>{w.label}</Pill>
				))}

				<button type="button" onClick={() => setFullscreen(!fullscreen)}
					className="ml-auto text-muted-foreground/30 hover:text-muted-foreground text-xs transition-colors"
					title={fullscreen ? "Close (Esc)" : "Expand"}>
					{fullscreen ? "✕" : "⤢"}
				</button>
			</div>

			{/* Chart */}
			<div ref={containerRef} className={fullscreen ? "flex-1 min-h-0" : "h-28"}>
				<canvas ref={canvasRef} className="w-full h-full cursor-crosshair"
					onMouseMove={e => { const r = e.currentTarget.getBoundingClientRect(); setHover({ x: e.clientX - r.left, y: e.clientY - r.top }) }}
					onMouseLeave={() => setHover(null)} />
			</div>

			{/* Stats strip */}
			<div className="px-3 py-2 border-t border-border">
				<div className="flex items-center gap-2 mb-1.5">
					<span className="size-1.5 rounded-full" style={{ background: BID }} />
					<span className="font-mono text-[9px] text-muted-foreground">BIDS</span>
					<span className="font-mono text-[10px] text-foreground">{totalBids}</span>
					{bestBid > 0 && <span className="font-mono text-[9px] ml-auto" style={{ color: BID }}>${formatPrice(bestBid)}</span>}
				</div>
				<div className="flex items-center gap-2 mb-2">
					<span className="size-1.5 rounded-full" style={{ background: ASK }} />
					<span className="font-mono text-[9px] text-muted-foreground">ASKS</span>
					<span className="font-mono text-[10px] text-foreground">{totalAsks}</span>
					{bestAsk > 0 && <span className="font-mono text-[9px] ml-auto" style={{ color: ASK }}>${formatPrice(bestAsk)}</span>}
				</div>
				<div className="flex h-1 rounded-full overflow-hidden bg-muted gap-px">
					<div className="rounded-l-full transition-all duration-500" style={{ width: `${(totalBids / totalMax) * 100}%`, background: BID, opacity: totalBids > 0 ? 1 : 0.15 }} />
					<div className="rounded-r-full transition-all duration-500" style={{ width: `${(totalAsks / totalMax) * 100}%`, background: ASK, opacity: totalAsks > 0 ? 1 : 0.15 }} />
				</div>
			</div>

			{/* Task breakdown */}
			{asksByTask.length > 0 && (
				<div className={`px-3 pb-2 ${fullscreen ? "grid grid-cols-2 gap-x-4" : ""}`}>
					{asksByTask.map(([task, count]) => {
						const max = asksByTask[0]?.[1] ?? 1
						return (
							<div key={task} className="flex items-center gap-1.5 py-px">
								<span className="font-mono text-[8px] text-muted-foreground/40 w-12 shrink-0">{task}</span>
								<div className="flex-1 h-0.5 bg-muted rounded-full overflow-hidden">
									<div className="h-full rounded-full" style={{ width: `${(count / max) * 100}%`, background: ASK, opacity: 0.5 }} />
								</div>
								<span className="font-mono text-[8px] text-muted-foreground/30 w-3 text-right">{count}</span>
							</div>
						)
					})}
				</div>
			)}
		</div>
	)

	if (fullscreen) {
		return (
			<div className="fixed inset-0 z-50 bg-background/98 backdrop-blur-sm flex flex-col" onClick={e => { if (e.target === e.currentTarget) setFullscreen(false) }}>
				<div className="flex-1 flex flex-col m-4 sm:m-8 border border-border rounded-md overflow-hidden bg-card">
					{chart}
				</div>
			</div>
		)
	}

	return <div className="bg-card overflow-y-auto">{chart}</div>
}

function Pill({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
	return (
		<button type="button" onClick={onClick}
			className={`px-1.5 py-0.5 font-mono text-[9px] font-medium tracking-[0.5px] rounded-[2px] transition-all ${
				active ? "bg-foreground/10 text-foreground" : "text-muted-foreground/25 hover:text-muted-foreground/60"
			}`}>
			{children}
		</button>
	)
}
