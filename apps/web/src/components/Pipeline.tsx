import type { BuyOrder, SellOrder } from "@payload-exchange/protocol"
import { truncateAddress } from "@/lib/format"
import { useState } from "react"

type MatchedPair = {
	buyOrder: BuyOrder
	sellOrder: SellOrder
	stage: "matched" | "executing" | "fulfilled" | "attested" | "settled"
	matchedAt: number
	fulfilledAt?: number
	attestedAt?: number
	settledAt?: number
}

type Props = {
	pairs: MatchedPair[]
}

const STAGES = ["matched", "executing", "fulfilled", "attested", "settled"] as const
const STAGE_META: Record<string, { label: string; color: string; bg: string }> = {
	matched: { label: "MATCH", color: "text-foreground", bg: "bg-foreground" },
	executing: { label: "EXEC", color: "text-amber-500", bg: "bg-amber-500" },
	fulfilled: { label: "DONE", color: "text-blue-400", bg: "bg-blue-400" },
	attested: { label: "ATTEST", color: "text-accent", bg: "bg-accent" },
	settled: { label: "SETTLED", color: "text-bid", bg: "bg-bid" },
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

function formatDuration(ms: number): string {
	const s = Math.floor(ms / 1000)
	if (s < 60) return `${s}s`
	if (s < 3600) return `${Math.floor(s / 60)}m ${s % 60}s`
	return `${Math.floor(s / 3600)}h ${Math.floor((s % 3600) / 60)}m`
}

function formatTime(ts: number): string {
	const d = new Date(ts)
	return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false })
}

export function Pipeline({ pairs }: Props) {
	const [showHistory, setShowHistory] = useState(true)

	const active = pairs.filter((p) => p.stage !== "settled")
	const settled = pairs.filter((p) => p.stage === "settled")

	// Stage counts
	const counts: Record<string, number> = {}
	for (const s of STAGES) counts[s] = 0
	for (const p of pairs) counts[p.stage] = (counts[p.stage] ?? 0) + 1

	return (
		<div className="bg-card border-b border-border flex flex-col overflow-hidden">
			{/* Header: always visible */}
			<div className="px-4 sm:px-8 lg:px-12 py-2 border-b border-border flex items-center gap-3 shrink-0">
				<span className="font-mono text-[10px] font-medium text-muted-foreground tracking-[0.5px]">
					EXECUTION PIPELINE
				</span>

				{/* Stage counts */}
				<div className="flex items-center gap-3 ml-auto">
					{STAGES.map((s) => (
						<div key={s} className="flex items-center gap-1">
							<span className={`size-1.5 rounded-full ${counts[s] > 0 ? STAGE_META[s].bg : "bg-muted"}`} />
							<span className={`font-mono text-[9px] tracking-[0.5px] ${counts[s] > 0 ? STAGE_META[s].color : "text-muted-foreground/40"}`}>
								{counts[s]}
							</span>
							<span className="hidden sm:inline font-mono text-[9px] text-muted-foreground/40 tracking-[0.5px]">
								{STAGE_META[s].label}
							</span>
						</div>
					))}
				</div>
			</div>

			{/* Active orders */}
			<div className="overflow-y-auto max-h-[40vh]">
				{pairs.length === 0 && (
					<div className="flex items-center justify-center h-12 font-mono text-[10px] text-muted-foreground tracking-[0.5px]">
						<span className="size-1.5 rounded-full bg-muted-foreground animate-pulse mr-2" />
						WAITING FOR MATCHES
					</div>
				)}

				{active.map((pair) => (
					<PipelineRow key={pair.buyOrder.id} pair={pair} />
				))}

				{/* History divider + settled orders */}
				{settled.length > 0 && (
					<button
						type="button"
						onClick={() => setShowHistory((v) => !v)}
						className="w-full px-4 sm:px-8 lg:px-12 py-1 border-b border-border flex items-center gap-2 cursor-pointer hover:bg-foreground/5 transition-all duration-300"
					>
						<span className="font-mono text-[9px] text-muted-foreground/50 select-none">
							{showHistory ? "▾" : "▸"}
						</span>
						<span className="font-mono text-[9px] text-muted-foreground/50 tracking-[0.5px]">
							HISTORY
						</span>
						<span className="font-mono text-[9px] text-muted-foreground/30">
							{settled.length}
						</span>
					</button>
				)}

				{showHistory && settled.map((pair) => (
					<PipelineRow key={pair.buyOrder.id} pair={pair} dimmed />
				))}
			</div>
		</div>
	)
}

function PipelineRow({ pair, dimmed }: { pair: MatchedPair; dimmed?: boolean }) {
	const stageIdx = STAGES.indexOf(pair.stage)
	const meta = STAGE_META[pair.stage]
	const now = Date.now()
	const endTime = pair.settledAt ?? now
	const duration = endTime - pair.matchedAt

	return (
		<div className={`px-4 sm:px-8 lg:px-12 py-1.5 flex items-center gap-2 border-b border-border animate-[fade-in_0.3s_ease-out] ${dimmed ? "opacity-40" : ""}`}>
			{/* Task type */}
			<span className="font-mono text-[9px] text-muted-foreground tracking-[0.5px] w-12 shrink-0">
				{TASK_LABELS[pair.buyOrder.taskClass]}
			</span>

			{/* Timestamp */}
			<span className="font-mono text-[9px] text-muted-foreground/50 shrink-0 w-14 hidden sm:inline">
				{formatTime(pair.matchedAt)}
			</span>

			{/* Intent text */}
			<span className="hidden md:inline text-[10px] text-foreground/70 truncate min-w-0 flex-shrink w-32 lg:w-48">
				{pair.buyOrder.intent}
			</span>

			{/* Buyer → Seller */}
			<span className="hidden xl:inline font-mono text-[9px] text-bid shrink-0 w-20 truncate">
				{truncateAddress(pair.buyOrder.buyer)}
			</span>
			<span className="hidden xl:inline text-muted-foreground/30 text-[9px] shrink-0">→</span>
			<span className="hidden xl:inline font-mono text-[9px] text-ask shrink-0 w-20 truncate">
				{truncateAddress(pair.sellOrder.seller)}
			</span>

			{/* Progress bar */}
			<div className="flex-1 flex items-center gap-0.5 min-w-0">
				{STAGES.map((stage, i) => (
					<div
						key={stage}
						className={`h-1.5 flex-1 rounded-[2px] transition-all duration-500 ${
							i <= stageIdx ? STAGE_META[stage].bg : "bg-muted"
						} ${i === stageIdx ? "opacity-100" : i < stageIdx ? "opacity-30" : "opacity-100"}`}
					/>
				))}
			</div>

			{/* Stage label */}
			<span className={`font-mono text-[9px] font-medium tracking-[0.5px] w-12 text-right shrink-0 ${meta.color}`}>
				{meta.label}
			</span>

			{/* Duration */}
			<span className="font-mono text-[9px] text-muted-foreground/40 w-12 text-right shrink-0">
				{formatDuration(duration)}
			</span>
		</div>
	)
}
