import { formatPrice, truncateAddress } from "@/lib/format"
import { useLoadMore } from "@/hooks/useInfiniteScroll"
import { LoadMoreBtn } from "@/components/LoadMoreBtn"
import { useState } from "react"

type ResultEntry = {
	orderId: string
	intent: string
	taskClass: string
	buyer: string
	seller: string
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	result: any
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	proof: any
	agreedPrice: number
	settledAt?: number
	fulfilledAt?: number
	txHash?: string
	status: string
}

type Props = {
	entries: ResultEntry[]
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
	if (!txHash || txHash.startsWith("tx:")) return null
	const base = isTestnet() ? "https://explore.moderato.tempo.xyz" : "https://explore.tempo.xyz"
	return `${base}/tx/${txHash}`
}

function formatTime(ts: number): string {
	return new Date(ts * 1000).toLocaleString([], {
		month: "short",
		day: "numeric",
		hour: "2-digit",
		minute: "2-digit",
		second: "2-digit",
		hour12: false,
	})
}

export function Results({ entries }: Props) {
	const [expandedId, setExpandedId] = useState<string | null>(null)

	const settled = entries.filter((e) => e.status === "settled" && e.result)
	const { visible, hasMore, remaining, loadMore } = useLoadMore(settled, 15)

	return (
		<div className="h-full flex flex-col overflow-hidden">
			<div className="px-4 sm:px-6 py-2.5 border-b border-border bg-card/50 flex items-center gap-3 shrink-0">
				<span className="font-mono text-[11px] font-semibold text-foreground tracking-[0.5px]">
					RESULTS
				</span>
				<span className="font-mono text-[10px] text-muted-foreground">
					{settled.length} fulfilled
				</span>
			</div>

			<div className="flex-1 overflow-y-auto">
				{settled.length === 0 && (
					<div className="flex flex-col items-center justify-center h-full gap-2">
						<span className="font-mono text-[11px] text-muted-foreground/50">NO RESULTS YET</span>
						<span className="font-mono text-[9px] text-muted-foreground/30 max-w-[280px] text-center">
							Fulfilled and settled orders will appear here with their results
						</span>
					</div>
				)}

				{visible.map((entry) => {
					const expanded = expandedId === entry.orderId
					return (
						<div key={entry.orderId} className="border-b border-border">
							<button
								type="button"
								onClick={() => setExpandedId(expanded ? null : entry.orderId)}
								className="w-full px-4 sm:px-6 py-3 text-left hover:bg-foreground/[0.02] transition-colors"
							>
								<div className="flex items-center gap-2 mb-1">
									<span className="font-mono text-[9px] font-semibold tracking-[0.5px] px-1.5 py-0.5 rounded-[2px] bg-foreground/10 text-foreground/70">
										{TASK_LABELS[entry.taskClass] ?? entry.taskClass}
									</span>
									<span className="font-mono text-[10px] text-bid font-medium">
										${formatPrice(entry.agreedPrice)}
									</span>
									{entry.settledAt && (
										<span className="font-mono text-[9px] text-muted-foreground/40 ml-auto">
											{formatTime(entry.settledAt)}
										</span>
									)}
									<span className="font-mono text-[10px] text-muted-foreground/40 select-none">
										{expanded ? "▾" : "▸"}
									</span>
								</div>
								<div className="text-[11px] text-foreground/80 truncate">
									{entry.intent}
								</div>
								<div className="flex items-center gap-2 mt-1">
									<span className="font-mono text-[8px] text-bid/50">
										{truncateAddress(entry.buyer)}
									</span>
									<span className="text-muted-foreground/20 text-[8px]">→</span>
									<span className="font-mono text-[8px] text-ask/50">
										{truncateAddress(entry.seller)}
									</span>
								</div>
							</button>

							{expanded && (
								<div className="px-4 sm:px-6 pb-3 animate-[fade-in_0.2s_ease-out]">
									{/* Result */}
									<div className="mb-2">
										<span className="font-mono text-[9px] text-accent tracking-[0.5px] font-semibold">RESULT</span>
										<pre className="mt-1 bg-background border border-border rounded-[3px] p-3 text-[10px] text-foreground/80 overflow-x-auto font-mono leading-relaxed max-h-48 overflow-y-auto">
											{String(JSON.stringify(entry.result, null, 2))}
										</pre>
									</div>

									{/* Proof */}
									{entry.proof && (
										<div className="mb-2">
											<span className="font-mono text-[9px] text-muted-foreground tracking-[0.5px] font-semibold">PROOF</span>
											<pre className="mt-1 bg-background border border-border rounded-[3px] p-2 text-[9px] text-muted-foreground/60 overflow-x-auto font-mono">
												{String(JSON.stringify(entry.proof, null, 2))}
											</pre>
										</div>
									)}

									{/* Settlement */}
									{entry.txHash && (
										<div className="flex items-center gap-2 mt-2">
											<span className="font-mono text-[9px] text-muted-foreground/40">TX</span>
											{(() => {
												const url = txExplorerUrl(entry.txHash)
												return url ? (
													<a href={url} target="_blank" rel="noopener noreferrer" className="font-mono text-[9px] text-accent/70 hover:text-accent underline underline-offset-2">
														{entry.txHash.slice(0, 16)}...
													</a>
												) : (
													<span className="font-mono text-[9px] text-muted-foreground/40">{entry.txHash.slice(0, 16)}...</span>
												)
											})()}
										</div>
									)}
								</div>
							)}
						</div>
					)
				})}
				{hasMore && <LoadMoreBtn remaining={remaining} onClick={loadMore} />}
			</div>
		</div>
	)
}
