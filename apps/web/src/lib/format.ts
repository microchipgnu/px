export function formatPrice(price: number): string {
	if (price < 0.01) return price.toFixed(4)
	if (price < 1) return price.toFixed(3)
	return price.toFixed(2)
}

export function formatTime(timestamp: number): string {
	const diff = Math.floor(Date.now() / 1000) - timestamp
	if (diff < 60) return `${diff}s ago`
	if (diff < 3600) return `${Math.floor(diff / 60)}m ago`
	if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`
	return `${Math.floor(diff / 86400)}d ago`
}

export function truncateAddress(addr: string): string {
	if (addr.length <= 16) return addr
	const parts = addr.split("...")
	if (parts.length === 2) return `${parts[0].slice(-6)}...${parts[1]}`
	return `${addr.slice(0, 8)}...${addr.slice(-6)}`
}

export function formatExpiry(timestamp: number): string {
	const diff = timestamp - Math.floor(Date.now() / 1000)
	if (diff <= 0) return "expired"
	if (diff < 3600) return `${Math.floor(diff / 60)}m`
	if (diff < 86400) return `${Math.floor(diff / 3600)}h`
	return `${Math.floor(diff / 86400)}d`
}
