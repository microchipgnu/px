import type { TaskClass } from "@payload-exchange/protocol"
import type { OrderbookFilter } from "@/hooks/useOrderbook"

const TASK_CLASSES: Array<{ value: TaskClass | "all"; label: string }> = [
	{ value: "all", label: "ALL" },
	{ value: "onchain_swap", label: "SWAP" },
	{ value: "bridge", label: "BRIDGE" },
	{ value: "yield", label: "YIELD" },
	{ value: "price_feed", label: "FEED" },
	{ value: "monitoring", label: "MONITOR" },
	{ value: "smart_contract", label: "CONTRACT" },
	{ value: "search", label: "SEARCH" },
	{ value: "computation", label: "COMPUTE" },
]

type Props = {
	filter: OrderbookFilter
	onFilterChange: (update: Partial<OrderbookFilter>) => void
}

export function FilterBar({ filter, onFilterChange }: Props) {
	return (
		<div className="border-b border-border bg-background px-4 sm:px-8 lg:px-12 py-2 flex items-center gap-2">
			<div className="flex items-center gap-0 overflow-x-auto scrollbar-none">
				{TASK_CLASSES.map((tc) => (
					<button
						key={tc.value}
						type="button"
						onClick={() => onFilterChange({ taskClass: tc.value })}
						className={`h-7 px-2 sm:px-2.5 font-mono text-[10px] sm:text-[11px] font-medium tracking-[0.5px] transition-all duration-300 rounded-[2px] whitespace-nowrap shrink-0 ${
							filter.taskClass === tc.value
								? "bg-foreground text-background"
								: "text-muted-foreground hover:text-foreground hover:bg-foreground/5"
						}`}
					>
						{tc.label}
					</button>
				))}
			</div>
			<input
				type="text"
				placeholder="Search..."
				value={filter.search}
				onChange={(e) => onFilterChange({ search: e.target.value })}
				className="ml-auto bg-muted border border-border rounded-[2px] px-3 py-1 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-border-hover w-28 sm:w-40 font-mono tracking-[0.5px] shrink-0"
			/>
		</div>
	)
}
