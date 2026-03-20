import { formatPrice } from "@/lib/format"

export type DataMode = "mock" | "live"

type Props = {
	totalMatched: number
	totalVolume: number
	ordersPerMinute: number
	mode: DataMode
	onModeChange: (mode: DataMode) => void
}

export function Header({ totalMatched, totalVolume, ordersPerMinute, mode, onModeChange }: Props) {
	return (
		<nav className="w-full border-b border-border bg-black/95 backdrop-blur">
			<div className="px-4 sm:px-8 lg:px-12 h-12 sm:h-14 flex items-center justify-between">
				{/* Left: Logo + Nav */}
				<div className="flex items-center gap-1">
					<div className="flex items-center justify-center w-8 h-8 sm:w-9 sm:h-9 bg-foreground shrink-0">
						<span className="text-background font-mono font-bold text-xs sm:text-sm">px</span>
					</div>
					<span className="flex items-center h-8 sm:h-9 px-2 sm:px-3 font-mono text-xs sm:text-sm font-medium tracking-[0.5px] bg-foreground text-background">
						ORDERBOOK
					</span>
					<a href="/skill" className="hidden sm:flex items-center h-9 px-3 font-mono text-sm font-medium tracking-[0.5px] text-muted-foreground hover:text-foreground hover:bg-foreground/5 transition-all duration-300 no-underline">
						DOCS
					</a>
				</div>

				{/* Right: Stats + Mode toggle */}
				<div className="flex items-center gap-3 sm:gap-4">
					<div className="hidden md:flex items-center gap-4 font-mono text-xs tracking-[0.5px]">
						<span className="text-muted-foreground">
							MATCHED <span className="text-foreground ml-1">{totalMatched}</span>
						</span>
						<span className="text-muted-foreground">
							VOL <span className="text-foreground ml-1">${formatPrice(totalVolume)}</span>
						</span>
						<span className="text-muted-foreground">
							OPM <span className="text-foreground ml-1">{ordersPerMinute}</span>
						</span>
					</div>
					<div className="flex items-center gap-0 bg-muted rounded-[2px]">
						<button
							type="button"
							onClick={() => onModeChange("mock")}
							className={`flex items-center gap-1.5 h-7 sm:h-9 px-2 sm:px-3 rounded-[2px] font-mono text-[10px] sm:text-xs font-medium tracking-[0.5px] transition-all duration-300 ${
								mode === "mock"
									? "bg-amber-500/10 text-amber-500"
									: "text-muted-foreground hover:text-foreground"
							}`}
						>
							<span className={`size-1.5 rounded-full ${mode === "mock" ? "bg-amber-500 animate-[pulse-dot_2s_ease-in-out_infinite]" : "bg-muted-foreground"}`} />
							MOCK
						</button>
						<button
							type="button"
							onClick={() => onModeChange("live")}
							className={`flex items-center gap-1.5 h-7 sm:h-9 px-2 sm:px-3 rounded-[2px] font-mono text-[10px] sm:text-xs font-medium tracking-[0.5px] transition-all duration-300 ${
								mode === "live"
									? "bg-accent-bg text-accent"
									: "text-muted-foreground hover:text-foreground"
							}`}
						>
							<span className={`size-1.5 rounded-full ${mode === "live" ? "bg-accent animate-[pulse-dot_2s_ease-in-out_infinite]" : "bg-muted-foreground"}`} />
							LIVE
						</button>
					</div>
				</div>
			</div>
		</nav>
	)
}
