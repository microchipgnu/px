import type { ActivityEvent, ActivityEventType } from "@payload-exchange/protocol"
import { formatPrice, truncateAddress } from "@/lib/format"
import { useState } from "react"

type Props = {
	events: ActivityEvent[]
}

const EVENT_META: Record<
	ActivityEventType,
	{ label: string; color: string }
> = {
	order_placed: { label: "NEW", color: "text-bid" },
	order_matched: { label: "MATCH", color: "text-foreground" },
	execution_started: { label: "EXEC", color: "text-amber-500" },
	fulfillment_submitted: { label: "DONE", color: "text-blue-400" },
	attestation_passed: { label: "ATTEST", color: "text-accent" },
	attestation_failed: { label: "REJECT", color: "text-ask" },
	settlement_complete: { label: "SETTLE", color: "text-bid" },
	order_expired: { label: "EXPIRE", color: "text-muted-foreground" },
	order_cancelled: { label: "CANCEL", color: "text-muted-foreground" },
	solver_joined: { label: "SOLVER", color: "text-accent" },
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
	// Only link real tx hashes (not placeholders like "tx:abc123")
	if (txHash.startsWith("tx:")) return null
	const base = isTestnet() ? "https://explore.moderato.tempo.xyz" : "https://explore.tempo.xyz"
	return `${base}/tx/${txHash}`
}

function truncateTxHash(hash: string): string {
	if (hash.startsWith("tx:")) return hash
	if (hash.length <= 16) return hash
	return `${hash.slice(0, 10)}…${hash.slice(-6)}`
}

export function ActivityFeed({ events }: Props) {
	const [open, setOpen] = useState(false)

	return (
		<div className="flex flex-col bg-background border-t border-border overflow-hidden">
			<button
				type="button"
				onClick={() => setOpen((v) => !v)}
				className="px-4 sm:px-8 lg:px-12 py-1.5 border-b border-border flex items-center gap-2 shrink-0 bg-card cursor-pointer hover:bg-foreground/5 transition-all duration-300"
			>
				<span className="font-mono text-[10px] text-muted-foreground select-none">{open ? "▾" : "▸"}</span>
				<span className="size-1.5 rounded-full bg-accent animate-[pulse-dot_1.5s_ease-in-out_infinite]" />
				<span className="font-mono text-[10px] font-medium text-muted-foreground tracking-[0.5px]">
					NETWORK ACTIVITY
				</span>
				<span className="ml-auto font-mono text-[10px] text-muted-foreground">
					{events.length}
				</span>
			</button>

			{open && (
				<div className="overflow-y-auto max-h-44">
					{events.map((event, i) => (
						<ActivityRow key={event.id} event={event} isNew={i === 0} />
					))}
				</div>
			)}
		</div>
	)
}

function ActivityRow({ event, isNew }: { event: ActivityEvent; isNew: boolean }) {
	const meta = EVENT_META[event.type]
	const age = Math.floor(Date.now() / 1000) - event.timestamp

	return (
		<div
			className={`flex items-center gap-2 px-4 sm:px-8 lg:px-12 py-1 border-b border-border hover:bg-foreground/5 transition-all duration-300 ${isNew ? "animate-[fade-in_0.3s_ease-out]" : ""}`}
		>
			<span className="font-mono text-[10px] text-muted-foreground w-7 shrink-0">
				{age < 60 ? `${age}s` : `${Math.floor(age / 60)}m`}
			</span>

			<span className={`font-mono text-[10px] font-medium tracking-[0.5px] w-12 shrink-0 ${meta.color}`}>
				{meta.label}
			</span>

			<span className="truncate font-mono text-[10px] min-w-0 flex-1">
				{event.buyer && (
					<span className="text-foreground">{truncateAddress(event.buyer)}</span>
				)}
				{event.seller && event.buyer && (
					<span className="text-muted-foreground mx-1">→</span>
				)}
				{event.seller && (
					<span className="text-foreground">{truncateAddress(event.seller)}</span>
				)}
				{event.txHash && (
					<TxHashLink txHash={event.txHash} />
				)}
				{event.intent && !event.txHash && (
					<span className="text-muted-foreground ml-1.5 hidden sm:inline">
						{event.intent.length > 45 ? `${event.intent.slice(0, 45)}…` : event.intent}
					</span>
				)}
				{!event.intent && !event.txHash && event.detail && (
					<span className="text-muted-foreground ml-1.5 hidden sm:inline">
						{event.detail.length > 45 ? `${event.detail.slice(0, 45)}…` : event.detail}
					</span>
				)}
			</span>

			<span className="hidden sm:inline text-right font-mono text-[10px] text-muted-foreground w-12 shrink-0">
				{event.price != null ? `$${formatPrice(event.price)}` : ""}
			</span>

			<span className="hidden sm:inline text-right font-mono text-[9px] text-muted-foreground tracking-[0.5px] w-10 shrink-0">
				{event.taskClass ? TASK_LABELS[event.taskClass] ?? event.taskClass : ""}
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
				className="ml-1.5 text-accent hover:text-accent/80 underline underline-offset-2 decoration-accent/40 hidden sm:inline"
				title={txHash}
			>
				{truncateTxHash(txHash)}
			</a>
		)
	}

	return (
		<span className="ml-1.5 text-muted-foreground hidden sm:inline" title={txHash}>
			{truncateTxHash(txHash)}
		</span>
	)
}
