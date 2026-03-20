export type DataMode = "mock" | "live"

type Props = {
	totalMatched: number
	totalVolume: number
	ordersPerMinute: number
	mode: DataMode
	onModeChange: (mode: DataMode) => void
	page?: "dashboard" | "results"
}

export function Header({ mode, onModeChange, page }: Props) {
	return (
		<nav className="w-full border-b border-border bg-black/95 backdrop-blur">
			<div className="px-4 sm:px-6 h-11 sm:h-12 flex items-center justify-between">
				{/* Left: Logo + Nav */}
				<div className="flex items-center gap-1">
					<a href="#" className="flex items-center gap-0 no-underline">
						<div className="flex items-center justify-center w-8 h-8 bg-foreground shrink-0">
							<span className="text-background font-mono font-bold text-xs">px</span>
						</div>
						<span className={`flex items-center h-8 px-2 font-mono text-xs font-medium tracking-[0.5px] no-underline ${
							page !== "results" ? "bg-foreground text-background" : "text-muted-foreground hover:text-foreground hover:bg-foreground/5"
						}`}>
							ORDERBOOK
						</span>
					</a>
					<a
						href="#results"
						className={`flex items-center h-8 px-2 font-mono text-xs font-medium tracking-[0.5px] transition-all duration-300 no-underline ${
							page === "results" ? "bg-foreground text-background" : "text-muted-foreground hover:text-foreground hover:bg-foreground/5"
						}`}
					>
						RESULTS
					</a>
					<a href="/skill" className="hidden sm:flex items-center h-8 px-2 font-mono text-xs font-medium tracking-[0.5px] text-muted-foreground hover:text-foreground hover:bg-foreground/5 transition-all duration-300 no-underline">
						DOCS
					</a>
				</div>

				{/* Right: Mode toggle */}
				<div className="flex items-center gap-3">
					<div className="flex items-center gap-0 bg-muted rounded-[2px]">
						<button
							type="button"
							onClick={() => onModeChange("mock")}
							className={`flex items-center gap-1.5 h-7 px-2 sm:px-3 rounded-[2px] font-mono text-[10px] font-medium tracking-[0.5px] transition-all duration-300 ${
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
							className={`flex items-center gap-1.5 h-7 px-2 sm:px-3 rounded-[2px] font-mono text-[10px] font-medium tracking-[0.5px] transition-all duration-300 ${
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
