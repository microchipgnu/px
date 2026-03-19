import type { BuyOrder, SellOrder } from "@payload-exchange/protocol"
import { truncateAddress } from "@/lib/format"
import { useState } from "react"

type MatchedPair = {
	buyOrder: BuyOrder
	sellOrder: SellOrder
	stage: "matched" | "executing" | "fulfilled" | "attested" | "settled"
	matchedAt: number
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

export function Pipeline({ pairs }: Props) {
	const [open, setOpen] = useState(false)

	return (
		<div className="bg-card border-t border-border flex flex-col overflow-hidden">
			<button
				type="button"
				onClick={() => setOpen((v) => !v)}
				className="px-4 sm:px-8 lg:px-12 py-1.5 border-b border-border flex items-center gap-3 shrink-0 cursor-pointer hover:bg-foreground/5 transition-all duration-300"
			>
				<span className="font-mono text-[10px] text-muted-foreground select-none">{open ? "▾" : "▸"}</span>
				<span className="font-mono text-[10px] font-medium text-muted-foreground tracking-[0.5px]">
					PIPELINE
				</span>
				<span className="font-mono text-[10px] text-muted-foreground">{pairs.length}</span>
				<div className="ml-auto hidden sm:flex items-center gap-3">
					{STAGES.map((s) => (
						<div key={s} className="flex items-center gap-1">
							<span className={`size-1 rounded-full ${STAGE_META[s].bg}`} />
							<span className="font-mono text-[9px] text-muted-foreground tracking-[0.5px]">{STAGE_META[s].label}</span>
						</div>
					))}
				</div>
			</button>

			{open && (
				<div className="overflow-y-auto max-h-36">
					{pairs.length === 0 && (
						<div className="flex items-center justify-center h-10 font-mono text-[10px] text-muted-foreground tracking-[0.5px]">
							WAITING FOR MATCHES
						</div>
					)}
					{pairs.map((pair) => (
						<PipelineRow key={pair.buyOrder.id} pair={pair} />
					))}
				</div>
			)}
		</div>
	)
}

function PipelineRow({ pair }: { pair: MatchedPair }) {
	const stageIdx = STAGES.indexOf(pair.stage)
	const meta = STAGE_META[pair.stage]

	return (
		<div className="px-4 sm:px-8 lg:px-12 py-1 flex items-center gap-2 border-b border-border animate-[fade-in_0.3s_ease-out]">
			<span className="font-mono text-[9px] text-muted-foreground tracking-[0.5px] w-12 shrink-0">
				{TASK_LABELS[pair.buyOrder.taskClass]}
			</span>

			<span className="hidden sm:inline font-mono text-[9px] text-bid shrink-0 w-28 truncate">
				{truncateAddress(pair.buyOrder.buyer)}
			</span>
			<span className="hidden sm:inline text-muted-foreground text-[9px] shrink-0">→</span>
			<span className="hidden sm:inline font-mono text-[9px] text-ask shrink-0 w-28 truncate">
				{truncateAddress(pair.sellOrder.seller)}
			</span>

			<div className="flex-1 flex items-center gap-0.5 min-w-0">
				{STAGES.map((stage, i) => (
					<div
						key={stage}
						className={`h-1 flex-1 rounded-[2px] transition-all duration-500 ${
							i <= stageIdx ? STAGE_META[stage].bg : "bg-muted"
						} ${i === stageIdx ? "opacity-100" : i < stageIdx ? "opacity-30" : "opacity-100"}`}
					/>
				))}
			</div>

			<span className={`font-mono text-[9px] font-medium tracking-[0.5px] w-12 text-right shrink-0 ${meta.color}`}>
				{meta.label}
			</span>
		</div>
	)
}
