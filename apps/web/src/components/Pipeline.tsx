import type { BuyOrder, SellOrder } from "@payload-exchange/protocol"
import { truncateAddress } from "@/lib/format"

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
const STAGE_META: Record<string, { label: string; color: string; bg: string; bgMuted: string }> = {
	matched: { label: "MATCH", color: "text-foreground", bg: "bg-foreground", bgMuted: "bg-foreground/20" },
	executing: { label: "EXEC", color: "text-amber-500", bg: "bg-amber-500", bgMuted: "bg-amber-500/20" },
	fulfilled: { label: "DONE", color: "text-blue-400", bg: "bg-blue-400", bgMuted: "bg-blue-400/20" },
	attested: { label: "ATTEST", color: "text-accent", bg: "bg-accent", bgMuted: "bg-accent/20" },
	settled: { label: "SETTLED", color: "text-bid", bg: "bg-bid", bgMuted: "bg-bid/20" },
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
	return new Date(ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false })
}

export function Pipeline({ pairs }: Props) {
	const active = pairs.filter((p) => p.stage !== "settled")
	const settled = pairs.filter((p) => p.stage === "settled")

	const counts: Record<string, number> = {}
	for (const s of STAGES) counts[s] = 0
	for (const p of pairs) counts[p.stage] = (counts[p.stage] ?? 0) + 1

	return (
		<div className="h-full flex flex-col overflow-hidden">
			{/* Header with stage counts */}
			<div className="px-4 sm:px-6 py-2.5 border-b border-border bg-card/50 flex items-center gap-4 shrink-0">
				<span className="font-mono text-[11px] font-semibold text-foreground tracking-[0.5px]">
					EXECUTION PIPELINE
				</span>
				<div className="flex items-center gap-3 ml-auto">
					{STAGES.map((s) => (
						<div key={s} className="flex items-center gap-1">
							<span className={`size-1.5 rounded-full ${counts[s] > 0 ? STAGE_META[s].bg : "bg-muted"}`} />
							<span className={`font-mono text-[10px] font-medium ${counts[s] > 0 ? STAGE_META[s].color : "text-muted-foreground/30"}`}>
								{counts[s]}
							</span>
							<span className="hidden sm:inline font-mono text-[9px] text-muted-foreground/40 tracking-[0.5px]">
								{STAGE_META[s].label}
							</span>
						</div>
					))}
				</div>
			</div>

			{/* Content */}
			<div className="flex-1 min-h-0 overflow-y-auto">
				{pairs.length === 0 && (
					<div className="flex flex-col items-center justify-center h-full gap-3">
						<div className="flex items-center gap-1.5">
							<span className="size-1.5 rounded-full bg-muted-foreground/30 animate-[pulse-dot_2s_ease-in-out_infinite]" />
							<span className="size-1.5 rounded-full bg-muted-foreground/30 animate-[pulse-dot_2s_ease-in-out_0.3s_infinite]" />
							<span className="size-1.5 rounded-full bg-muted-foreground/30 animate-[pulse-dot_2s_ease-in-out_0.6s_infinite]" />
						</div>
						<span className="font-mono text-[11px] text-muted-foreground/50 tracking-[0.5px]">
							WAITING FOR MATCHES
						</span>
						<span className="font-mono text-[9px] text-muted-foreground/30 max-w-[240px] text-center">
							Orders appear here when buy intents are matched with solver offers
						</span>
					</div>
				)}

				{/* Active orders */}
				{active.map((pair) => (
					<PipelineCard key={pair.buyOrder.id} pair={pair} />
				))}

				{/* Settled history */}
				{settled.length > 0 && (
					<div className="px-4 sm:px-6 py-1.5 border-b border-border bg-muted/30">
						<span className="font-mono text-[9px] text-muted-foreground/40 tracking-[1px]">
							HISTORY — {settled.length} settled
						</span>
					</div>
				)}
				{settled.map((pair) => (
					<PipelineCard key={pair.buyOrder.id} pair={pair} dimmed />
				))}
			</div>
		</div>
	)
}

function PipelineCard({ pair, dimmed }: { pair: MatchedPair; dimmed?: boolean }) {
	const stageIdx = STAGES.indexOf(pair.stage)
	const meta = STAGE_META[pair.stage]
	const now = Date.now()
	const endTime = pair.settledAt ?? now
	const duration = endTime - pair.matchedAt

	return (
		<div className={`px-4 sm:px-6 py-2.5 border-b border-border hover:bg-foreground/[0.02] transition-all duration-300 animate-[fade-in_0.3s_ease-out] ${dimmed ? "opacity-35" : ""}`}>
			{/* Top line: task + intent + time */}
			<div className="flex items-center gap-2 mb-1.5">
				<span className={`font-mono text-[9px] font-semibold tracking-[0.5px] px-1.5 py-0.5 rounded-[2px] ${dimmed ? "bg-muted text-muted-foreground" : "bg-foreground/10 text-foreground/70"}`}>
					{TASK_LABELS[pair.buyOrder.taskClass]}
				</span>
				<span className="font-mono text-[11px] text-foreground/80 truncate min-w-0 flex-1">
					{pair.buyOrder.intent}
				</span>
				<span className="font-mono text-[9px] text-muted-foreground/50 shrink-0">
					{formatTime(pair.matchedAt)}
				</span>
			</div>

			{/* Progress bar */}
			<div className="flex items-center gap-1 mb-1.5">
				{STAGES.map((stage, i) => (
					<div key={stage} className="flex-1 flex flex-col items-center gap-0.5">
						<div
							className={`w-full h-[3px] rounded-full transition-all duration-500 ${
								i <= stageIdx ? STAGE_META[stage].bg : "bg-muted"
							} ${i === stageIdx && !dimmed ? "opacity-100" : i < stageIdx ? "opacity-30" : "opacity-100"}`}
						/>
					</div>
				))}
			</div>

			{/* Bottom line: addresses + stage + duration */}
			<div className="flex items-center gap-2">
				<span className="font-mono text-[9px] text-bid/70">
					{truncateAddress(pair.buyOrder.buyer)}
				</span>
				<span className="text-muted-foreground/30 text-[9px]">→</span>
				<span className="font-mono text-[9px] text-ask/70">
					{truncateAddress(pair.sellOrder.seller)}
				</span>
				<span className="flex-1" />
				<span className={`font-mono text-[9px] font-semibold tracking-[0.5px] ${meta.color}`}>
					{meta.label}
				</span>
				<span className="font-mono text-[9px] text-muted-foreground/40">
					{formatDuration(duration)}
				</span>
			</div>
		</div>
	)
}
