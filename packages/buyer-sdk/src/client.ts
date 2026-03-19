import type { TaskClass } from "@payload-exchange/protocol"

export interface SubmitIntentParams {
	buyer: string
	taskClass: TaskClass
	intent: string
	constraints?: Record<string, unknown>
	maxPrice: number
	expiry: number
	proofRequirements?: string[]
	disputeWindow?: number
	signature?: string
}

export interface OrderStatusResponse {
	id: string
	status: string
}

export interface WaitForStatusOptions {
	timeout?: number  // ms, default 60_000
	interval?: number // ms, default 1_000
}

export class BuyerClient {
	private baseUrl: string

	constructor(private coordinatorUrl: string) {
		// Normalise: strip trailing slash
		this.baseUrl = coordinatorUrl.replace(/\/+$/, "")
	}

	/**
	 * Submit an intent (buy order) to the coordinator.
	 */
	async submitIntent(intent: SubmitIntentParams): Promise<OrderStatusResponse> {
		const res = await fetch(`${this.baseUrl}/api/orders/buy`, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify(intent),
		})

		if (!res.ok) {
			const body = await res.json().catch(() => ({}))
			throw new Error(`submitIntent failed (${res.status}): ${JSON.stringify(body)}`)
		}

		return res.json() as Promise<OrderStatusResponse>
	}

	/**
	 * Poll the current status of an order.
	 */
	async getStatus(orderId: string): Promise<OrderStatusResponse> {
		const res = await fetch(`${this.baseUrl}/api/orders/${orderId}/status`)

		if (!res.ok) {
			const body = await res.json().catch(() => ({}))
			throw new Error(`getStatus failed (${res.status}): ${JSON.stringify(body)}`)
		}

		return res.json() as Promise<OrderStatusResponse>
	}

	/**
	 * Wait until the order reaches `targetStatus`, polling every `interval` ms.
	 * Throws if `timeout` ms elapse first.
	 */
	async waitForStatus(
		orderId: string,
		targetStatus: string,
		options?: WaitForStatusOptions,
	): Promise<OrderStatusResponse> {
		const timeout = options?.timeout ?? 60_000
		const interval = options?.interval ?? 1_000
		const deadline = Date.now() + timeout

		// Lifecycle ordering — accept target or any later status
		const lifecycle = ["open", "matched", "executing", "fulfilled", "attested", "settled"]
		const targetIdx = lifecycle.indexOf(targetStatus)

		while (Date.now() < deadline) {
			const status = await this.getStatus(orderId)

			// Exact match or advanced past target in the lifecycle
			const currentIdx = lifecycle.indexOf(status.status)
			if (status.status === targetStatus || (targetIdx >= 0 && currentIdx >= targetIdx)) {
				return status
			}

			// Terminal failure states
			const terminal = ["expired", "cancelled", "disputed"]
			if (terminal.includes(status.status)) {
				throw new Error(
					`Order ${orderId} reached terminal status "${status.status}" while waiting for "${targetStatus}"`,
				)
			}

			await new Promise((resolve) => setTimeout(resolve, interval))
		}

		throw new Error(
			`Timed out waiting for order ${orderId} to reach status "${targetStatus}" (timeout: ${timeout}ms)`,
		)
	}

	/**
	 * Get the fulfillment result (raw Response).
	 * Returns the raw fetch Response so callers can inspect status (402, 200, etc.).
	 */
	async getResult(orderId: string): Promise<Response> {
		return fetch(`${this.baseUrl}/api/orders/${orderId}/result`)
	}

	/**
	 * Get result with automatic MPP payment via an mppx-wrapped fetch function.
	 * The `mppxFetch` should be a fetch function created by mppx that handles
	 * 402 challenges automatically.
	 */
	async settle(orderId: string, mppxFetch: typeof fetch): Promise<unknown> {
		const res = await mppxFetch(`${this.baseUrl}/api/orders/${orderId}/result`)

		if (!res.ok) {
			const body = await res.json().catch(() => ({}))
			throw new Error(`settle failed (${res.status}): ${JSON.stringify(body)}`)
		}

		return res.json()
	}
}
