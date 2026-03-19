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
const BID_FILL_TOP = "rgba(13, 148, 136, 0.25)"
const BID_FILL_BOT = "rgba(13, 148, 136, 0.04)"
const ASK_COLOR = "#ef4444"
const ASK_FILL_TOP = "rgba(239, 68, 68, 0.25)"
const ASK_FILL_BOT = "rgba(239, 68, 68, 0.04)"
const GRID_COLOR = "#1C2123"
const LABEL_COLOR = "#8A8F8F"
const CROSSHAIR_COLOR = "#2A2F31"
const VOL_BID = "rgba(13, 148, 136, 0.5)"
const VOL_ASK = "rgba(239, 68, 68, 0.4)"

type DepthLevel = { price: number; cum: number }

function buildDepth(buyOrders: BuyOrder[], sellOrders: SellOrder[]) {
	const bids = [...buyOrders]
		.sort((a, b) => b.maxPrice - a.maxPrice)
		.reduce<DepthLevel[]>((acc, o) => {
			const prev = acc.length > 0 ? acc[acc.length - 1].cum : 0
			acc.push({ price: o.maxPrice, cum: prev + 1 })
			return acc
		}, [])

	const asks = [...sellOrders]
		.sort((a, b) => a.price - b.price)
		.reduce<DepthLevel[]>((acc, o) => {
			const prev = acc.length > 0 ? acc[acc.length - 1].cum : 0
			acc.push({ price: o.price, cum: prev + 1 })
			return acc
		}, [])

	return { bids, asks }
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
	const canvasRef = useRef<HTMLCanvasElement>(null)
	const volCanvasRef = useRef<HTMLCanvasElement>(null)
	const containerRef = useRef<HTMLDivElement>(null)
	const volContainerRef = useRef<HTMLDivElement>(null)
	const [open, setOpen] = useState(false)
	const [hover, setHover] = useState<{ x: number; y: number } | null>(null)
	const [hoverLabel, setHoverLabel] = useState("")

	const { bids, asks } = useMemo(() => buildDepth(buyOrders, sellOrders), [buyOrders, sellOrders])
	const volBuckets = useMemo(() => bucketVolume(matchHistory, 30), [matchHistory])

	const bestBid = bids[0]?.price ?? 0
	const bestAsk = asks[0]?.price ?? 0
	const mid = bestBid > 0 && bestAsk > 0 ? (bestBid + bestAsk) / 2 : bestBid || bestAsk
	const spread = bestAsk > 0 && bestBid > 0 ? bestAsk - bestBid : 0

	const draw = useCallback(() => {
		if (!open) return
		const canvas = canvasRef.current
		const container = containerRef.current
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

		if (bids.length === 0 && asks.length === 0) {
			ctx.fillStyle = LABEL_COLOR
			ctx.font = "10px 'Geist Mono', monospace"
			ctx.textAlign = "center"
			ctx.fillText("WAITING FOR ORDERS", w / 2, h / 2)
			return
		}

		const padL = 32
		const padR = 32
		const padT = 12
		const padB = 28
		const cw = w - padL - padR
		const ch = h - padT - padB
		const centerX = padL + cw / 2
		const halfW = cw / 2
		const gap = 24

		// Shared y-axis: max order count across both sides
		const maxCum = Math.max(
			bids.length > 0 ? bids[bids.length - 1].cum : 0,
			asks.length > 0 ? asks[asks.length - 1].cum : 0,
			1,
		)
		// Add 15% headroom
		const yMax = Math.ceil(maxCum * 1.15)

		const depthToY = (d: number) => padT + ch - (d / yMax) * ch

		// Price ranges
		const bidLow = bids.length > 0 ? bids[bids.length - 1].price : bestBid
		const bidRange = Math.max(bestBid - bidLow, 0.01)
		const askHigh = asks.length > 0 ? asks[asks.length - 1].price : bestAsk
		const askRange = Math.max(askHigh - bestAsk, 0.01)

		const usableHalf = halfW - gap / 2
		const bidPriceToX = (p: number) => {
			const pct = Math.min((bestBid - p) / bidRange, 1)
			return centerX - gap / 2 - pct * usableHalf
		}
		const askPriceToX = (p: number) => {
			const pct = Math.min((p - bestAsk) / askRange, 1)
			return centerX + gap / 2 + pct * usableHalf
		}

		// ── Grid ────────────────────────────────────────────────────────────

		ctx.font = "9px 'Geist Mono', monospace"
		const yTicks = 4
		for (let i = 0; i <= yTicks; i++) {
			const val = (yMax / yTicks) * i
			const y = depthToY(val)

			ctx.strokeStyle = GRID_COLOR
			ctx.lineWidth = 1
			ctx.beginPath()
			ctx.moveTo(padL, Math.round(y) + 0.5)
			ctx.lineTo(w - padR, Math.round(y) + 0.5)
			ctx.stroke()

			if (i > 0) {
				ctx.fillStyle = LABEL_COLOR
				ctx.textAlign = "right"
				ctx.fillText(String(Math.round(val)), padL - 6, y + 3)
				ctx.textAlign = "left"
				ctx.fillText(String(Math.round(val)), w - padR + 6, y + 3)
			}
		}

		// ── Bid curve ───────────────────────────────────────────────────────

		if (bids.length > 0) {
			const startX = centerX - gap / 2

			// Fill path
			ctx.beginPath()
			ctx.moveTo(startX, depthToY(0))
			for (let i = 0; i < bids.length; i++) {
				const x = bidPriceToX(bids[i].price)
				const y = depthToY(bids[i].cum)
				if (i === 0) {
					ctx.lineTo(startX, y)
					ctx.lineTo(x, y)
				} else {
					ctx.lineTo(x, depthToY(bids[i - 1].cum))
					ctx.lineTo(x, y)
				}
			}
			ctx.lineTo(padL, depthToY(bids[bids.length - 1].cum))
			ctx.lineTo(padL, depthToY(0))
			ctx.closePath()

			const grad = ctx.createLinearGradient(0, padT, 0, padT + ch)
			grad.addColorStop(0, BID_FILL_TOP)
			grad.addColorStop(1, BID_FILL_BOT)
			ctx.fillStyle = grad
			ctx.fill()

			// Stroke
			ctx.beginPath()
			ctx.moveTo(startX, depthToY(0))
			for (let i = 0; i < bids.length; i++) {
				const x = bidPriceToX(bids[i].price)
				const y = depthToY(bids[i].cum)
				if (i === 0) {
					ctx.lineTo(startX, y)
					ctx.lineTo(x, y)
				} else {
					ctx.lineTo(x, depthToY(bids[i - 1].cum))
					ctx.lineTo(x, y)
				}
			}
			ctx.lineTo(padL, depthToY(bids[bids.length - 1].cum))
			ctx.strokeStyle = BID_COLOR
			ctx.lineWidth = 1.5
			ctx.stroke()
		}

		// ── Ask curve ───────────────────────────────────────────────────────

		if (asks.length > 0) {
			const startX = centerX + gap / 2

			ctx.beginPath()
			ctx.moveTo(startX, depthToY(0))
			for (let i = 0; i < asks.length; i++) {
				const x = askPriceToX(asks[i].price)
				const y = depthToY(asks[i].cum)
				if (i === 0) {
					ctx.lineTo(startX, y)
					ctx.lineTo(x, y)
				} else {
					ctx.lineTo(x, depthToY(asks[i - 1].cum))
					ctx.lineTo(x, y)
				}
			}
			ctx.lineTo(w - padR, depthToY(asks[asks.length - 1].cum))
			ctx.lineTo(w - padR, depthToY(0))
			ctx.closePath()

			const grad = ctx.createLinearGradient(0, padT, 0, padT + ch)
			grad.addColorStop(0, ASK_FILL_TOP)
			grad.addColorStop(1, ASK_FILL_BOT)
			ctx.fillStyle = grad
			ctx.fill()

			ctx.beginPath()
			ctx.moveTo(startX, depthToY(0))
			for (let i = 0; i < asks.length; i++) {
				const x = askPriceToX(asks[i].price)
				const y = depthToY(asks[i].cum)
				if (i === 0) {
					ctx.lineTo(startX, y)
					ctx.lineTo(x, y)
				} else {
					ctx.lineTo(x, depthToY(asks[i - 1].cum))
					ctx.lineTo(x, y)
				}
			}
			ctx.lineTo(w - padR, depthToY(asks[asks.length - 1].cum))
			ctx.strokeStyle = ASK_COLOR
			ctx.lineWidth = 1.5
			ctx.stroke()
		}

		// ── X-axis labels ───────────────────────────────────────────────────

		ctx.font = "9px 'Geist Mono', monospace"
		ctx.fillStyle = LABEL_COLOR

		// Bid side: best bid + lowest bid
		if (bids.length > 0) {
			ctx.textAlign = "center"
			ctx.fillText(`$${formatPrice(bestBid)}`, centerX - gap / 2, h - 6)
			if (bids.length > 1) {
				ctx.textAlign = "left"
				ctx.fillText(`$${formatPrice(bids[bids.length - 1].price)}`, padL, h - 6)
			}
		}

		// Ask side: best ask + highest ask
		if (asks.length > 0) {
			ctx.textAlign = "center"
			ctx.fillText(`$${formatPrice(bestAsk)}`, centerX + gap / 2, h - 6)
			if (asks.length > 1) {
				ctx.textAlign = "right"
				ctx.fillText(`$${formatPrice(asks[asks.length - 1].price)}`, w - padR, h - 6)
			}
		}

		// Spread label centered
		ctx.textAlign = "center"
		ctx.fillStyle = LABEL_COLOR
		ctx.fillText(spread > 0 ? `$${formatPrice(spread)}` : "—", centerX, h - 6)

		// ── Crosshair ───────────────────────────────────────────────────────

		if (hover) {
			const { x, y } = hover
			if (x >= padL && x <= w - padR && y >= padT && y <= padT + ch) {
				ctx.strokeStyle = CROSSHAIR_COLOR
				ctx.lineWidth = 1
				ctx.setLineDash([2, 2])
				ctx.beginPath()
				ctx.moveTo(x, padT)
				ctx.lineTo(x, padT + ch)
				ctx.stroke()
				ctx.beginPath()
				ctx.moveTo(padL, y)
				ctx.lineTo(w - padR, y)
				ctx.stroke()
				ctx.setLineDash([])

				const onBidSide = x < centerX
				const cumAtY = Math.max(0, ((padT + ch - y) / ch) * yMax)

				let priceAtX = 0
				if (onBidSide && bids.length > 0) {
					const pct = Math.max(0, Math.min(1, (centerX - gap / 2 - x) / usableHalf))
					priceAtX = bestBid - pct * bidRange
				} else if (asks.length > 0) {
					const pct = Math.max(0, Math.min(1, (x - centerX - gap / 2) / usableHalf))
					priceAtX = bestAsk + pct * askRange
				}

				if (priceAtX > 0) {
					const label = `$${formatPrice(priceAtX)}  |  ${Math.round(cumAtY)} orders`
					ctx.font = "10px 'Geist Mono', monospace"
					const tw = ctx.measureText(label).width + 12
					const tx = Math.min(Math.max(x - tw / 2, padL), w - padR - tw)
					const ty = Math.max(y - 24, padT)

					ctx.fillStyle = "#0D1416"
					ctx.strokeStyle = onBidSide ? BID_COLOR : ASK_COLOR
					ctx.lineWidth = 1
					ctx.beginPath()
					ctx.roundRect(tx, ty, tw, 18, 2)
					ctx.fill()
					ctx.stroke()

					ctx.fillStyle = "#E8E8E8"
					ctx.textAlign = "left"
					ctx.fillText(label, tx + 6, ty + 13)

					setHoverLabel(
						`${onBidSide ? "BID" : "ASK"} $${formatPrice(priceAtX)} — ${Math.round(cumAtY)} ORDERS`,
					)
				}
			}
		}
	}, [open, bids, asks, bestBid, bestAsk, spread, hover])

	// ── Volume bars ─────────────────────────────────────────────────────────

	const drawVol = useCallback(() => {
		if (!open) return
		const canvas = volCanvasRef.current
		const container = volContainerRef.current
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

		if (volBuckets.length === 0) return
		const maxVol = Math.max(...volBuckets, 0.01)
		const barW = Math.max((w - 4) / volBuckets.length - 1, 2)
		const g = 1

		for (let i = 0; i < volBuckets.length; i++) {
			const val = volBuckets[i]
			if (val === 0) continue
			const barH = Math.max((val / maxVol) * (h - 2), 1)
			const x = 2 + i * (barW + g)
			const y = h - barH
			ctx.fillStyle = i >= volBuckets.length * 0.6 ? VOL_BID : VOL_ASK
			ctx.beginPath()
			ctx.roundRect(x, y, barW, barH, 1)
			ctx.fill()
		}
	}, [open, volBuckets])

	useEffect(() => { draw() }, [draw])
	useEffect(() => { drawVol() }, [drawVol])

	const handleMouseMove = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
		const rect = e.currentTarget.getBoundingClientRect()
		setHover({ x: e.clientX - rect.left, y: e.clientY - rect.top })
	}, [])

	const handleMouseLeave = useCallback(() => {
		setHover(null)
		setHoverLabel("")
	}, [])

	return (
		<div className="border-t border-border bg-card overflow-hidden">
			<button
				type="button"
				onClick={() => setOpen((v) => !v)}
				className="w-full px-4 sm:px-8 lg:px-12 py-1.5 border-b border-border flex items-center gap-3 cursor-pointer hover:bg-foreground/5 transition-all duration-300"
			>
				<span className="font-mono text-[10px] text-muted-foreground select-none">
					{open ? "▾" : "▸"}
				</span>
				<span className="font-mono text-[10px] font-medium text-muted-foreground tracking-[0.5px]">
					DEPTH
				</span>
				{hoverLabel && open && (
					<span className="font-mono text-[10px] tracking-[0.5px] text-foreground">
						{hoverLabel}
					</span>
				)}
				<div className="ml-auto flex items-center gap-4">
					<div className="flex items-center gap-1">
						<span className="size-1.5 rounded-full" style={{ backgroundColor: BID_COLOR }} />
						<span className="font-mono text-[9px] text-muted-foreground tracking-[0.5px]">BIDS</span>
					</div>
					<div className="flex items-center gap-1">
						<span className="size-1.5 rounded-full" style={{ backgroundColor: ASK_COLOR }} />
						<span className="font-mono text-[9px] text-muted-foreground tracking-[0.5px]">ASKS</span>
					</div>
					{mid > 0 && (
						<span className="hidden sm:inline font-mono text-[9px] text-muted-foreground tracking-[0.5px]">
							MID ${formatPrice(mid)}
						</span>
					)}
				</div>
			</button>

			{open && (
				<div className="px-1 sm:px-4 lg:px-8">
					<div ref={containerRef} className="h-40 sm:h-52">
						<canvas
							ref={canvasRef}
							className="w-full h-full cursor-crosshair"
							onMouseMove={handleMouseMove}
							onMouseLeave={handleMouseLeave}
						/>
					</div>
					<div ref={volContainerRef} className="h-8 sm:h-10 border-t border-border">
						<canvas ref={volCanvasRef} className="w-full h-full" />
					</div>
					<div className="flex justify-between px-10 py-1">
						<span className="font-mono text-[8px] text-muted-foreground tracking-[0.5px]">2M AGO</span>
						<span className="font-mono text-[8px] text-muted-foreground tracking-[0.5px]">MATCH VOLUME</span>
						<span className="font-mono text-[8px] text-muted-foreground tracking-[0.5px]">NOW</span>
					</div>
				</div>
			)}
		</div>
	)
}
