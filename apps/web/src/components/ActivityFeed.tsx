import type { ActivityEvent, ActivityEventType } from "@payload-exchange/protocol"
import { formatPrice, truncateAddress } from "@/lib/format"
import { useLoadMore } from "@/hooks/useInfiniteScroll"
import { LoadMoreBtn } from "@/components/LoadMoreBtn"

type Props = {
	events: ActivityEvent[]
}

const EVENT_META: Record<
	ActivityEventType,
	{ label: string; color: string; borderColor: string }
> = {
	order_placed: { label: "NEW", color: "text-bid", borderColor: "#0d9488" },
	order_matched: { label: "MATCH", color: "text-foreground", borderColor: "#e5e5e5" },
	execution_started: { label: "EXEC", color: "text-amber-500", borderColor: "#f59e0b" },
	fulfillment_submitted: { label: "DONE", color: "text-blue-400", borderColor: "#60a5fa" },
	attestation_passed: { label: "ATTEST", color: "text-accent", borderColor: "#22c55e" },
	attestation_failed: { label: "REJECT", color: "text-ask", borderColor: "#ef4444" },
	settlement_complete: { label: "SETTLE", color: "text-bid", borderColor: "#0d9488" },
	order_expired: { label: "EXPIRE", color: "text-muted-foreground", borderColor: "#555" },
	order_cancelled: { label: "CANCEL", color: "text-muted-foreground", borderColor: "#555" },
	solver_joined: { label: "SOLVER", color: "text-accent", borderColor: "#22c55e" },
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

function isTestnet(): boolean {
	const host = window.location.host
	return host.includes("px-test") || host.includes("localhost")
}

function txExplorerUrl(txHash: string): string | null {
	if (txHash.startsWith("tx:")) return null
	const base = isTestnet() ? "https://explore.moderato.tempo.xyz" : "https://explore.tempo.xyz"
	return `${base}/tx/${txHash}`
}

function truncateTxHash(hash: string): string {
	if (hash.startsWith("tx:")) return hash
	if (hash.length <= 16) return hash
	return `${hash.slice(0, 10)}…${hash.slice(-4)}`
}

export function ActivityFeed({ events }: Props) {
	const { visible, hasMore, remaining, loadMore } = useLoadMore(events, 20)

	return (
		<div className="h-full flex flex-col overflow-hidden">
			<div className="px-3 py-2 border-b border-border flex items-center gap-2 bg-card/50 shrink-0">
				<span className="size-1.5 rounded-full bg-accent animate-[pulse-dot_1.5s_ease-in-out_infinite]" />
				<span className="font-mono text-[10px] font-semibold text-muted-foreground tracking-[0.5px]">
					ACTIVITY
				</span>
				<span className="ml-auto font-mono text-[10px] text-muted-foreground/40">
					{events.length}
				</span>
			</div>

			<div className="flex-1 overflow-y-auto">
				{events.length === 0 && (
					<div className="flex items-center justify-center h-20">
						<span className="font-mono text-[10px] text-muted-foreground/30">NO EVENTS</span>
					</div>
				)}
				{visible.map((event, i) => (
					<ActivityRow key={event.id} event={event} isNew={i === 0} />
				))}
				{hasMore && <LoadMoreBtn remaining={remaining} onClick={loadMore} />}
			</div>
		</div>
	)
}

function ActivityRow({ event, isNew }: { event: ActivityEvent; isNew: boolean }) {
	const meta = EVENT_META[event.type]
	const age = Math.floor(Date.now() / 1000) - event.timestamp

	return (
		<div
			className={`flex items-center gap-1.5 px-3 py-1 border-b border-border border-l-2 hover:bg-foreground/[0.02] transition-colors ${isNew ? "animate-[fade-in_0.3s_ease-out]" : ""}`}
			style={{ borderLeftColor: meta.borderColor }}
		>
			<span className="font-mono text-[9px] text-muted-foreground/40 w-5 shrink-0">
				{age < 60 ? `${age}s` : `${Math.floor(age / 60)}m`}
			</span>

			<span className={`font-mono text-[9px] font-semibold tracking-[0.5px] w-10 shrink-0 ${meta.color}`}>
				{meta.label}
			</span>

			<span className="truncate font-mono text-[9px] min-w-0 flex-1 text-muted-foreground/60">
				{event.txHash && <TxHashLink txHash={event.txHash} />}
				{!event.txHash && event.orderId && (
					<span>{event.orderId.slice(0, 8)}</span>
				)}
			</span>

			<span className="font-mono text-[9px] text-muted-foreground/40 shrink-0">
				{event.price != null ? `$${formatPrice(event.price)}` : ""}
			</span>
		</div>
	)
}

function TxHashLink({ txHash }: { txHash: string }) {
	const url = txExplorerUrl(txHash)
	if (url) {
		return (
			<a
				href={url}
				target="_blank"
				rel="noopener noreferrer"
				className="text-accent/70 hover:text-accent underline underline-offset-2 decoration-accent/30"
				title={txHash}
			>
				{truncateTxHash(txHash)}
			</a>
		)
	}
	return <span title={txHash}>{truncateTxHash(txHash)}</span>
}
