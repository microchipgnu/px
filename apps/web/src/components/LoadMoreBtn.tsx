type Props = {
	remaining: number
	onClick: () => void
}

export function LoadMoreBtn({ remaining, onClick }: Props) {
	return (
		<button
			type="button"
			onClick={onClick}
			className="w-full py-2 font-mono text-[9px] text-muted-foreground/40 hover:text-muted-foreground hover:bg-foreground/[0.03] transition-colors tracking-[0.5px] border-b border-border"
		>
			LOAD MORE ({remaining})
		</button>
	)
}
