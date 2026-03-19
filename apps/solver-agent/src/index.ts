import { SolverClient } from "@payload-exchange/solver-sdk"
import type { WSEvent } from "@payload-exchange/solver-sdk"

const COORDINATOR_URL = process.env.COORDINATOR_URL ?? "http://localhost:4000"
const SOLVER_ADDRESS = process.env.SOLVER_ADDRESS ?? "0xSolverAgent001"

/**
 * Mock price fetcher. Returns simulated price data for any token pair.
 * Replace with real API calls (CoinGecko, Binance, etc.) in production.
 */
async function fetchPrices(
	token: string,
): Promise<{ twap: number; sources: Array<{ name: string; price: number; timestamp: number }> }> {
	const now = Math.floor(Date.now() / 1000)

	// Simulated prices with small variance
	const base = token.toUpperCase().includes("ETH") ? 3421.5 : 1.0
	const variance = () => base * (1 + (Math.random() - 0.5) * 0.002)

	const sources = [
		{ name: "binance", price: Number(variance().toFixed(2)), timestamp: now - 2 },
		{ name: "coinbase", price: Number(variance().toFixed(2)), timestamp: now - 5 },
		{ name: "kraken", price: Number(variance().toFixed(2)), timestamp: now - 3 },
	]

	const twap = Number((sources.reduce((sum, s) => sum + s.price, 0) / sources.length).toFixed(2))

	return { twap, sources }
}

async function main() {
	const client = new SolverClient(COORDINATOR_URL)

	// 1. Register as a price_feed solver
	console.log("[solver] Registering as price_feed solver...")

	let registration: { id: string; status: string }
	try {
		registration = await client.register({
			seller: SOLVER_ADDRESS,
			supportedTaskClasses: ["price_feed"],
			pricingModel: "fixed",
			price: 0.075,
			stake: 10,
			executionTerms: {
				maxLatency: "5s",
				minSources: 3,
			},
		})
	} catch (err) {
		console.error("[solver] Failed to register:", (err as Error).message)
		console.error("[solver] Is the coordinator running at", COORDINATOR_URL, "?")
		process.exit(1)
	}

	console.log(`[solver] Registered: ${registration.id} (stake: $10)`)

	// 2. Connect to WebSocket for match notifications
	console.log("[solver] Watching for intents...")

	let connection: ReturnType<typeof client.connect>
	try {
		connection = client.connect({ taskClasses: ["price_feed"] })
	} catch (err) {
		console.error("[solver] WebSocket connection failed:", (err as Error).message)
		process.exit(1)
	}

	// Handle graceful shutdown
	process.on("SIGINT", () => {
		console.log("\n[solver] Shutting down...")
		connection.close()
		process.exit(0)
	})

	process.on("SIGTERM", () => {
		console.log("\n[solver] Shutting down...")
		connection.close()
		process.exit(0)
	})

	for await (const event of connection.events) {
		console.log(`[solver] Event: ${event.event}`)

		if (event.event === "subscribed") {
			console.log("[solver] Subscribed to price_feed intents")
			continue
		}

		// Handle new_intent — this means the coordinator broadcast an intent we should look at
		if (event.event === "new_intent") {
			const data = event.data as {
				orderId: string
				taskClass: string
				intent: string
				constraints?: Record<string, unknown>
				maxPrice: number
			}

			console.log(`[solver] New intent received! Order: ${data.orderId}`)
			console.log(`[solver]   Intent: ${data.intent}`)
			console.log(`[solver]   Max fee: $${data.maxPrice}`)

			// Wait briefly for the matching engine to process
			await new Promise((resolve) => setTimeout(resolve, 2_000))
			continue
		}

		// Handle match — this means we've been assigned to an order
		if (event.event === "order_matched") {
			const data = event.data as {
				orderId: string
				buyer: string
				seller: string
				taskClass: string
				intent: string
				agreedPrice: number
			}

			// Only act on matches assigned to us
			if (data.seller !== SOLVER_ADDRESS) continue

			console.log(`[solver] Match received! Order: ${data.orderId}`)
			console.log(`[solver]   Intent: ${data.intent}`)
			console.log(`[solver]   Agreed price: $${data.agreedPrice}`)

			// Fetch price data
			console.log("[solver] Fetching prices...")
			const priceData = await fetchPrices(data.intent)
			console.log(`[solver] TWAP: $${priceData.twap} from ${priceData.sources.length} sources`)

			// Submit fulfillment
			console.log("[solver] Submitting fulfillment...")
			try {
				const response = await client.submitFulfillment({
					orderId: data.orderId,
					sellerId: SOLVER_ADDRESS,
					result: priceData,
					proof: {
						source_urls: priceData.sources.map((s) => `https://api.${s.name}.com/v1/ticker`),
						timestamps: priceData.sources.map((s) => s.timestamp),
						methodology: "TWAP",
					},
					executionTime: `${Date.now() - event.timestamp}ms`,
				})

				if (response.attestation.success) {
					const checkCount = response.attestation.checks?.length ?? 0
					const passedCount =
						response.attestation.checks?.filter((c) => c.passed).length ?? 0
					console.log(
						`[solver] Attestation: PASSED (${passedCount}/${checkCount} checks)`,
					)
				} else {
					console.log(
						`[solver] Attestation: FAILED - ${response.attestation.reason ?? "unknown reason"}`,
					)
				}

				console.log(`[solver] Next step: ${response.nextStep}`)
				console.log("[solver] Waiting for buyer payment...")
			} catch (err) {
				console.error("[solver] Fulfillment failed:", (err as Error).message)
			}

			continue
		}

		// Log settlement events
		if (event.event === "settlement_complete") {
			const data = event.data as {
				orderId: string
				buyerPaid: number
				sellerReceived: number
				txHash?: string
			}
			console.log(`[solver] Settlement complete for order ${data.orderId}`)
			console.log(`[solver]   Received: $${data.sellerReceived}`)
			if (data.txHash) {
				console.log(`[solver]   Tx: ${data.txHash}`)
			}
		}
	}

	console.log("[solver] WebSocket connection closed.")
}

main().catch((err) => {
	console.error("[solver] Fatal error:", err)
	process.exit(1)
})
