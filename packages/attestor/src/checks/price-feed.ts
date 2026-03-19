import type { AttestationCheck, BuyOrder, Fulfillment } from "@payload-exchange/protocol"

type PriceFeedResult = {
	twap?: number
	sources?: Array<{
		name: string
		price: number
		timestamp: number
	}>
}

export function checkPriceFeed(fulfillment: Fulfillment, buyOrder: BuyOrder): AttestationCheck[] {
	const checks: AttestationCheck[] = []
	const result = fulfillment.result as PriceFeedResult | undefined
	const constraints = buyOrder.constraints ?? {}
	const requiredSources = (constraints.sources as number) ?? 3
	const maxAge = (constraints.maxAge as number) ?? 60 // seconds
	const maxVariance = (constraints.maxVariance as number) ?? 0.02 // 2%

	// Check: result has sources
	const sources = result?.sources
	if (!sources || !Array.isArray(sources)) {
		checks.push({ name: "sources_present", passed: false, value: "no sources in result" })
		return checks
	}

	// Check: enough sources
	checks.push({
		name: "source_count",
		passed: sources.length >= requiredSources,
		value: sources.length,
	})

	// Check: all sources have valid prices
	const validPrices = sources.every((s) => typeof s.price === "number" && s.price > 0)
	checks.push({
		name: "valid_prices",
		passed: validPrices,
	})

	if (!validPrices || sources.length === 0) return checks

	// Check: price variance within tolerance
	const prices = sources.map((s) => s.price)
	const mean = prices.reduce((a, b) => a + b, 0) / prices.length
	const maxDeviation = Math.max(...prices.map((p) => Math.abs(p - mean) / mean))
	checks.push({
		name: "price_variance",
		passed: maxDeviation <= maxVariance,
		value: maxDeviation,
	})

	// Check: timestamps are fresh
	const now = Math.floor(Date.now() / 1000)
	const allFresh = sources.every((s) => typeof s.timestamp === "number" && now - s.timestamp <= maxAge)
	checks.push({
		name: "timestamp_freshness",
		passed: allFresh,
		value: allFresh ? undefined : "stale timestamps detected",
	})

	// Check: TWAP present and reasonable
	const twap = result?.twap
	if (typeof twap === "number" && twap > 0) {
		const twapDeviation = Math.abs(twap - mean) / mean
		checks.push({
			name: "twap_accuracy",
			passed: twapDeviation <= 0.001, // TWAP should be very close to mean
			value: twap,
		})
	} else {
		checks.push({ name: "twap_present", passed: false, value: "missing or invalid TWAP" })
	}

	return checks
}
