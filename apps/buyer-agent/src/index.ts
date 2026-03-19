import { BuyerClient, createIntent } from "@payload-exchange/buyer-sdk"
import { privateKeyToAccount, generatePrivateKey } from "viem/accounts"

const COORDINATOR_URL = process.env.COORDINATOR_URL ?? "http://localhost:4000"
const TEMPO_PRIVATE_KEY = process.env.TEMPO_PRIVATE_KEY ?? generatePrivateKey()

const account = privateKeyToAccount(TEMPO_PRIVATE_KEY as `0x${string}`)
const BUYER_ADDRESS = account.address

async function main() {
	const client = new BuyerClient(COORDINATOR_URL)

	console.log(`[buyer] Wallet: ${BUYER_ADDRESS}`)
	if (!process.env.TEMPO_PRIVATE_KEY) {
		console.log("[buyer] No TEMPO_PRIVATE_KEY set — generated ephemeral wallet (cannot pay via MPP)")
	}

	// 1. Create an intent for a price_feed task
	console.log("[buyer] Submitting intent: ETH/USD price from 3+ sources...")

	const intent = createIntent({
		buyer: BUYER_ADDRESS,
		taskClass: "price_feed",
		intent: "ETH/USD price from 3+ sources",
		constraints: {
			pair: "ETH/USD",
			minSources: 3,
			maxAge: 60, // seconds
		},
		maxPrice: 0.1,
		expiresIn: 3600,
		proofRequirements: ["source_urls", "timestamps"],
	})

	// 2. Submit to coordinator
	let order: { id: string; status: string }
	try {
		order = await client.submitIntent(intent)
	} catch (err) {
		console.error("[buyer] Failed to submit intent:", (err as Error).message)
		console.error("[buyer] Is the coordinator running at", COORDINATOR_URL, "?")
		process.exit(1)
	}

	console.log(`[buyer] Order created: ${order.id} (status: ${order.status})`)

	// 3. Wait for match
	console.log("[buyer] Waiting for match...")
	try {
		const matched = await client.waitForStatus(order.id, "matched", {
			timeout: 30_000,
			interval: 1_000,
		})
		console.log(`[buyer] Matched! (status: ${matched.status})`)
	} catch (err) {
		console.error("[buyer] Match wait failed:", (err as Error).message)
		process.exit(1)
	}

	// 4. Wait for attestation
	console.log("[buyer] Waiting for fulfillment and attestation...")
	try {
		const attested = await client.waitForStatus(order.id, "attested", {
			timeout: 60_000,
			interval: 1_000,
		})
		console.log(`[buyer] Attested! (status: ${attested.status})`)
	} catch (err) {
		console.error("[buyer] Attestation wait failed:", (err as Error).message)
		process.exit(1)
	}

	// 5. Attempt to get result (will show 402 if not yet settled)
	console.log("[buyer] Requesting result...")
	const rawRes = await client.getResult(order.id)

	if (rawRes.status === 402) {
		const challenge = await rawRes.json()
		const amount = challenge?.offers?.[0]?.amount ?? "unknown"
		console.log(`[buyer] 402 Payment Required -- $${amount} via Tempo`)

		// 6. If mppx client is configured, auto-pay
		if (process.env.TEMPO_PRIVATE_KEY) {
			console.log("[buyer] Paying via MPP...")
			try {
				const { Mppx, tempo } = await import("mppx/client")
				const mpp = Mppx.create({
					methods: [tempo({ account })],
					polyfill: false,
				})

				const result = await client.settle(order.id, mpp.fetch as typeof fetch)
				console.log("[buyer] Settled! Result received.")

				const data = result as Record<string, unknown>
				const fulfillment = data.fulfillment as Record<string, unknown> | undefined
				const settlement = data.settlement as Record<string, unknown> | undefined

				if (fulfillment?.result) {
					const r = fulfillment.result as Record<string, unknown>
					console.log(
						`[buyer] ETH/USD TWAP: $${r.twap ?? "N/A"} (${(r.sources as unknown[])?.length ?? "?"} sources)`,
					)
				}
				if (settlement?.txHash) {
					console.log(`[buyer] Settlement tx: ${settlement.txHash}`)
				}
			} catch (err) {
				console.error("[buyer] MPP payment failed:", (err as Error).message)
			}
		} else {
			console.log("[buyer] No TEMPO_PRIVATE_KEY set. Set it to auto-pay via MPP.")
			console.log("[buyer] Raw 402 challenge:", JSON.stringify(challenge, null, 2))
		}
	} else if (rawRes.ok) {
		// Already settled or free
		const result = await rawRes.json()
		console.log("[buyer] Result received (already settled).")
		console.log("[buyer] Result:", JSON.stringify(result, null, 2))
	} else {
		const body = await rawRes.json().catch(() => ({}))
		console.error(`[buyer] Unexpected response (${rawRes.status}):`, JSON.stringify(body))
	}

	console.log("[buyer] Done.")
}

main().catch((err) => {
	console.error("[buyer] Fatal error:", err)
	process.exit(1)
})
