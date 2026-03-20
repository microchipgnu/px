import type { BuyOrder, SellOrder } from "@payload-exchange/protocol"
import { formatPrice, truncateAddress } from "@/lib/format"
import { useLoadMore } from "@/hooks/useInfiniteScroll"
import { LoadMoreBtn } from "@/components/LoadMoreBtn"
import { useEffect, useState } from "react"

type MatchedPair = {
	buyOrder: BuyOrder
	sellOrder: SellOrder
	stage: "matched" | "executing" | "fulfilled" | "attested" | "settled"
	matchedAt: number
	fulfilledAt?: number
	attestedAt?: number
	settledAt?: number
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	result?: any
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	proof?: any
	txHash?: string
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
	onchain_swap: "SWAP", bridge: "BRIDGE", yield: "YIELD", price_feed: "FEED",
	search: "SEARCH", computation: "COMPUTE", monitoring: "MONITOR", smart_contract: "CONTRACT",
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

function formatDateTime(ts: number): string {
	return new Date(ts).toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false })
}

function isTestnet(): boolean {
	const host = window.location.host
	return host.includes("px-test") || host.includes("localhost")
}

function txUrl(hash: string): string | null {
	if (!hash || hash.startsWith("tx:")) return null
	return `${isTestnet() ? "https://explore.moderato.tempo.xyz" : "https://explore.tempo.xyz"}/tx/${hash}`
}

export function Pipeline({ pairs }: Props) {
	const [selected, setSelected] = useState<MatchedPair | null>(null)

	const active = pairs.filter((p) => p.stage !== "settled")
	const allSettled = pairs.filter((p) => p.stage === "settled")
	const settledPage = useLoadMore(allSettled, 10)

	const counts: Record<string, number> = {}
	for (const s of STAGES) counts[s] = 0
	for (const p of pairs) counts[p.stage] = (counts[p.stage] ?? 0) + 1

	// Esc to close modal
	useEffect(() => {
		if (!selected) return
		const fn = (e: KeyboardEvent) => { if (e.key === "Escape") setSelected(null) }
		window.addEventListener("keydown", fn)
		return () => window.removeEventListener("keydown", fn)
	}, [selected])

	return (
		<div className="h-full flex flex-col overflow-hidden">
			{/* Header */}
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

				{active.map((pair) => (
					<PipelineCard key={pair.buyOrder.id} pair={pair} onClick={() => setSelected(pair)} />
				))}

				{allSettled.length > 0 && (
					<div className="px-4 sm:px-6 py-1.5 border-b border-border bg-muted/30">
						<span className="font-mono text-[9px] text-muted-foreground/40 tracking-[1px]">
							HISTORY — {allSettled.length} settled
						</span>
					</div>
				)}
				{settledPage.visible.map((pair) => (
					<PipelineCard key={pair.buyOrder.id} pair={pair} dimmed onClick={() => setSelected(pair)} />
				))}
				{settledPage.hasMore && <LoadMoreBtn remaining={settledPage.remaining} onClick={settledPage.loadMore} />}
			</div>

			{/* Detail modal */}
			{selected && (
				<div
					className="fixed inset-0 z-50 bg-background/80 backdrop-blur-sm flex items-center justify-center p-4"
					onClick={(e) => { if (e.target === e.currentTarget) setSelected(null) }}
				>
					<DetailModal pair={selected} onClose={() => setSelected(null)} />
				</div>
			)}
		</div>
	)
}

function PipelineCard({ pair, dimmed, onClick }: { pair: MatchedPair; dimmed?: boolean; onClick: () => void }) {
	const stageIdx = STAGES.indexOf(pair.stage)
	const meta = STAGE_META[pair.stage]
	const endTime = pair.settledAt ?? Date.now()
	const duration = endTime - pair.matchedAt

	return (
		<button
			type="button"
			onClick={onClick}
			className={`w-full text-left px-4 sm:px-6 py-2.5 border-b border-border hover:bg-foreground/[0.03] transition-all duration-300 animate-[fade-in_0.3s_ease-out] cursor-pointer ${dimmed ? "opacity-35 hover:opacity-60" : ""}`}
		>
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

			<div className="flex items-center gap-1 mb-1.5">
				{STAGES.map((stage, i) => (
					<div key={stage} className={`flex-1 h-[3px] rounded-full transition-all duration-500 ${
						i <= stageIdx ? STAGE_META[stage].bg : "bg-muted"
					} ${i === stageIdx && !dimmed ? "opacity-100" : i < stageIdx ? "opacity-30" : "opacity-100"}`} />
				))}
			</div>

			<div className="flex items-center gap-2">
				<span className="font-mono text-[9px] text-bid/70">{truncateAddress(pair.buyOrder.buyer)}</span>
				<span className="text-muted-foreground/30 text-[9px]">→</span>
				<span className="font-mono text-[9px] text-ask/70">{truncateAddress(pair.sellOrder.seller)}</span>
				<span className="flex-1" />
				<span className={`font-mono text-[9px] font-semibold tracking-[0.5px] ${meta.color}`}>{meta.label}</span>
				<span className="font-mono text-[9px] text-muted-foreground/40">{formatDuration(duration)}</span>
			</div>
		</button>
	)
}

function DetailModal({ pair, onClose }: { pair: MatchedPair; onClose: () => void }) {
	const stageIdx = STAGES.indexOf(pair.stage)
	const meta = STAGE_META[pair.stage]
	const endTime = pair.settledAt ?? Date.now()
	const duration = endTime - pair.matchedAt

	return (
		<div className="bg-card border border-border rounded-lg w-full max-w-xl max-h-[85vh] flex flex-col overflow-hidden animate-[fade-in_0.15s_ease-out]">
			{/* Modal header */}
			<div className="px-5 py-3 border-b border-border flex items-center gap-2 shrink-0">
				<span className="font-mono text-[10px] font-semibold tracking-[0.5px] px-2 py-0.5 rounded-[2px] bg-foreground/10 text-foreground/70">
					{TASK_LABELS[pair.buyOrder.taskClass]}
				</span>
				<span className={`font-mono text-[10px] font-semibold tracking-[0.5px] ${meta.color}`}>
					{meta.label}
				</span>
				<span className="font-mono text-[9px] text-muted-foreground/40 ml-auto">
					{formatDuration(duration)}
				</span>
				<button type="button" onClick={onClose}
					className="text-muted-foreground/40 hover:text-muted-foreground text-sm transition-colors ml-2">
					✕
				</button>
			</div>

			{/* Scrollable content */}
			<div className="flex-1 overflow-y-auto">
				{/* Intent */}
				<div className="px-5 py-3 border-b border-border">
					<div className="font-mono text-[9px] text-muted-foreground/50 tracking-[0.5px] mb-1">INTENT</div>
					<div className="text-[12px] text-foreground/90 leading-relaxed">{pair.buyOrder.intent}</div>
				</div>

				{/* Progress */}
				<div className="px-5 py-3 border-b border-border">
					<div className="font-mono text-[9px] text-muted-foreground/50 tracking-[0.5px] mb-2">LIFECYCLE</div>
					<div className="flex items-center gap-1 mb-2">
						{STAGES.map((stage, i) => (
							<div key={stage} className={`flex-1 h-[4px] rounded-full transition-all ${
								i <= stageIdx ? STAGE_META[stage].bg : "bg-muted"
							} ${i === stageIdx ? "opacity-100" : i < stageIdx ? "opacity-30" : "opacity-100"}`} />
						))}
					</div>
					<div className="flex justify-between">
						{STAGES.map((stage, i) => (
							<span key={stage} className={`font-mono text-[8px] tracking-[0.5px] ${
								i <= stageIdx ? STAGE_META[stage].color : "text-muted-foreground/20"
							}`}>
								{STAGE_META[stage].label}
							</span>
						))}
					</div>
				</div>

				{/* Timeline */}
				<div className="px-5 py-3 border-b border-border">
					<div className="font-mono text-[9px] text-muted-foreground/50 tracking-[0.5px] mb-2">TIMELINE</div>
					<div className="space-y-1">
						<TimelineRow label="Matched" time={pair.matchedAt} />
						{pair.fulfilledAt && <TimelineRow label="Fulfilled" time={pair.fulfilledAt} prev={pair.matchedAt} />}
						{pair.attestedAt && <TimelineRow label="Attested" time={pair.attestedAt} prev={pair.fulfilledAt} />}
						{pair.settledAt && <TimelineRow label="Settled" time={pair.settledAt} prev={pair.attestedAt} />}
					</div>
				</div>

				{/* Parties */}
				<div className="px-5 py-3 border-b border-border grid grid-cols-2 gap-4">
					<div>
						<div className="font-mono text-[9px] text-muted-foreground/50 tracking-[0.5px] mb-1">BUYER</div>
						<div className="font-mono text-[11px] text-bid break-all">{pair.buyOrder.buyer}</div>
					</div>
					<div>
						<div className="font-mono text-[9px] text-muted-foreground/50 tracking-[0.5px] mb-1">SOLVER</div>
						<div className="font-mono text-[11px] text-ask break-all">{pair.sellOrder.seller}</div>
					</div>
				</div>

				{/* Price */}
				<div className="px-5 py-3 border-b border-border flex items-center gap-4">
					<div>
						<div className="font-mono text-[9px] text-muted-foreground/50 tracking-[0.5px] mb-0.5">MAX PRICE</div>
						<div className="font-mono text-[13px] text-bid font-medium">${formatPrice(pair.buyOrder.maxPrice)}</div>
					</div>
					<div>
						<div className="font-mono text-[9px] text-muted-foreground/50 tracking-[0.5px] mb-0.5">ORDER ID</div>
						<div className="font-mono text-[10px] text-muted-foreground/60">{pair.buyOrder.id}</div>
					</div>
				</div>

				{/* Result */}
				{pair.result && (
					<div className="px-5 py-3 border-b border-border">
						<div className="font-mono text-[9px] text-accent tracking-[0.5px] font-semibold mb-1">RESULT</div>
						<pre className="bg-background border border-border rounded-[3px] p-3 text-[10px] text-foreground/80 overflow-x-auto font-mono leading-relaxed max-h-52 overflow-y-auto">
							{String(JSON.stringify(pair.result, null, 2))}
						</pre>
					</div>
				)}

				{/* Proof */}
				{pair.proof && (
					<div className="px-5 py-3 border-b border-border">
						<div className="font-mono text-[9px] text-muted-foreground/50 tracking-[0.5px] font-semibold mb-1">PROOF</div>
						<pre className="bg-background border border-border rounded-[3px] p-2 text-[9px] text-muted-foreground/60 overflow-x-auto font-mono max-h-32 overflow-y-auto">
							{String(JSON.stringify(pair.proof, null, 2))}
						</pre>
					</div>
				)}

				{/* Transaction */}
				{pair.txHash && (
					<div className="px-5 py-3">
						<div className="font-mono text-[9px] text-muted-foreground/50 tracking-[0.5px] font-semibold mb-1">SETTLEMENT TX</div>
						{(() => {
							const url = txUrl(pair.txHash!)
							return url ? (
								<a href={url} target="_blank" rel="noopener noreferrer"
									className="font-mono text-[10px] text-accent/80 hover:text-accent underline underline-offset-2 decoration-accent/30 break-all">
									{pair.txHash}
								</a>
							) : (
								<span className="font-mono text-[10px] text-muted-foreground/50 break-all">{pair.txHash}</span>
							)
						})()}
					</div>
				)}
			</div>
		</div>
	)
}

function TimelineRow({ label, time, prev }: { label: string; time: number; prev?: number }) {
	const delta = prev ? time - prev : 0
	return (
		<div className="flex items-center gap-3">
			<span className="font-mono text-[9px] text-muted-foreground/50 w-16 shrink-0">{label}</span>
			<span className="font-mono text-[10px] text-foreground/70">{formatDateTime(time)}</span>
			{delta > 0 && (
				<span className="font-mono text-[9px] text-muted-foreground/30">+{formatDuration(delta)}</span>
			)}
		</div>
	)
}
