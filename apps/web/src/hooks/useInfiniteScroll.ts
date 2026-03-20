import { useCallback, useEffect, useRef, useState } from "react"

const PAGE_SIZE = 20

export function useInfiniteScroll<T>(items: T[], pageSize = PAGE_SIZE) {
	const [visibleCount, setVisibleCount] = useState(pageSize)
	const sentinelRef = useRef<HTMLDivElement>(null)

	// Reset when items change significantly (new data source)
	const prevLenRef = useRef(items.length)
	useEffect(() => {
		// If items shrunk (filter changed, mode switch), reset
		if (items.length < prevLenRef.current) {
			setVisibleCount(pageSize)
		}
		prevLenRef.current = items.length
	}, [items.length, pageSize])

	// Intersection observer on sentinel
	useEffect(() => {
		const sentinel = sentinelRef.current
		if (!sentinel) return

		const observer = new IntersectionObserver(
			(entries) => {
				if (entries[0]?.isIntersecting) {
					setVisibleCount((prev) => Math.min(prev + pageSize, items.length))
				}
			},
			{ threshold: 0 },
		)

		observer.observe(sentinel)
		return () => observer.disconnect()
	}, [items.length, pageSize])

	const visible = items.slice(0, visibleCount)
	const hasMore = visibleCount < items.length

	return { visible, hasMore, sentinelRef }
}
