import { useEffect, useRef, useState } from "react"

const PAGE_SIZE = 20

export function useLoadMore<T>(items: T[], pageSize = PAGE_SIZE) {
	const [visibleCount, setVisibleCount] = useState(pageSize)

	// Reset when items change significantly
	const prevLenRef = useRef(items.length)
	useEffect(() => {
		if (items.length < prevLenRef.current) {
			setVisibleCount(pageSize)
		}
		prevLenRef.current = items.length
	}, [items.length, pageSize])

	const visible = items.slice(0, visibleCount)
	const hasMore = visibleCount < items.length
	const remaining = items.length - visibleCount
	const loadMore = () => setVisibleCount((prev) => Math.min(prev + pageSize, items.length))

	return { visible, hasMore, remaining, loadMore }
}

// Keep old export name for compatibility during migration
export const useInfiniteScroll = useLoadMore
