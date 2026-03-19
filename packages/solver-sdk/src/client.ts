import type { TaskClass, PricingModel } from "@payload-exchange/protocol"

export interface RegisterOfferParams {
	seller: string
	supportedTaskClasses: TaskClass[]
	pricingModel: PricingModel
	price: number
	stake?: number
	executionTerms?: Record<string, unknown>
}

export interface SubmitFulfillmentParams {
	orderId: string
	sellerId: string
	result: unknown
	proof?: Record<string, unknown>
	executionTime?: string
	sellerSignature?: string
}

export interface FulfillmentResponse {
	orderId: string
	attestation: {
		success: boolean
		checks?: Array<{ name: string; passed: boolean; value?: unknown }>
		reason?: string
	}
	nextStep: string
}

export type WSEvent = {
	event: string
	data: unknown
	timestamp: number
}

export interface ConnectOptions {
	taskClasses?: string[]
}

export interface WSConnection {
	events: AsyncGenerator<WSEvent, void, undefined>
	close: () => void
}

export class SolverClient {
	private baseUrl: string

	constructor(private coordinatorUrl: string) {
		this.baseUrl = coordinatorUrl.replace(/\/+$/, "")
	}

	/**
	 * Register solver capabilities (sell order) with the coordinator.
	 */
	async register(offer: RegisterOfferParams): Promise<{ id: string; status: string }> {
		const res = await fetch(`${this.baseUrl}/api/orders/sell`, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify(offer),
		})

		if (!res.ok) {
			const body = await res.json().catch(() => ({}))
			throw new Error(`register failed (${res.status}): ${JSON.stringify(body)}`)
		}

		return res.json() as Promise<{ id: string; status: string }>
	}

	/**
	 * Connect to the coordinator WebSocket for real-time match notifications.
	 * Returns an async generator of WSEvent and a close handle.
	 */
	connect(options?: ConnectOptions): WSConnection {
		const wsUrl = this.baseUrl.replace(/^http/, "ws") + "/ws"

		// Buffer for events received before the consumer calls next()
		const buffer: WSEvent[] = []
		let resolve: ((value: IteratorResult<WSEvent, void>) => void) | null = null
		let closed = false
		let wsInstance: WebSocket | null = null

		const ws = new WebSocket(wsUrl)
		wsInstance = ws

		ws.addEventListener("open", () => {
			if (options?.taskClasses && options.taskClasses.length > 0) {
				ws.send(JSON.stringify({ type: "subscribe", taskClasses: options.taskClasses }))
			}
		})

		ws.addEventListener("message", (event) => {
			try {
				const parsed = JSON.parse(String(event.data)) as WSEvent
				if (resolve) {
					const r = resolve
					resolve = null
					r({ value: parsed, done: false })
				} else {
					buffer.push(parsed)
				}
			} catch {
				// ignore malformed messages
			}
		})

		ws.addEventListener("close", () => {
			closed = true
			if (resolve) {
				const r = resolve
				resolve = null
				r({ value: undefined, done: true })
			}
		})

		ws.addEventListener("error", () => {
			closed = true
			if (resolve) {
				const r = resolve
				resolve = null
				r({ value: undefined, done: true })
			}
		})

		async function* eventGenerator(): AsyncGenerator<WSEvent, void, undefined> {
			while (true) {
				if (buffer.length > 0) {
					yield buffer.shift()!
				} else if (closed) {
					return
				} else {
					const result = await new Promise<IteratorResult<WSEvent, void>>((r) => {
						resolve = r
					})
					if (result.done) return
					yield result.value
				}
			}
		}

		return {
			events: eventGenerator(),
			close: () => {
				closed = true
				if (wsInstance && wsInstance.readyState !== WebSocket.CLOSED) {
					wsInstance.close()
				}
				if (resolve) {
					const r = resolve
					resolve = null
					r({ value: undefined, done: true })
				}
			},
		}
	}

	/**
	 * Submit a fulfillment result for a matched order.
	 */
	async submitFulfillment(params: SubmitFulfillmentParams): Promise<FulfillmentResponse> {
		const res = await fetch(`${this.baseUrl}/api/fulfillments`, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify(params),
		})

		if (!res.ok && res.status !== 422) {
			const body = await res.json().catch(() => ({}))
			throw new Error(`submitFulfillment failed (${res.status}): ${JSON.stringify(body)}`)
		}

		return res.json() as Promise<FulfillmentResponse>
	}

	/**
	 * Get order details (useful after being matched to see constraints).
	 */
	async getOrder(orderId: string): Promise<unknown> {
		const res = await fetch(`${this.baseUrl}/api/orders/${orderId}`)

		if (!res.ok) {
			const body = await res.json().catch(() => ({}))
			throw new Error(`getOrder failed (${res.status}): ${JSON.stringify(body)}`)
		}

		return res.json()
	}
}
