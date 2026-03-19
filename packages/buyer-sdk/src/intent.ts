import type { TaskClass } from "@payload-exchange/protocol"

/**
 * Construct an intent payload ready for submission to the coordinator.
 */
export function createIntent(params: {
	buyer: string
	taskClass: TaskClass
	intent: string
	constraints?: Record<string, unknown>
	maxPrice: number
	expiresIn?: number // seconds from now, default 3600
	proofRequirements?: string[]
}): {
	buyer: string
	taskClass: TaskClass
	intent: string
	constraints?: Record<string, unknown>
	maxPrice: number
	expiry: number
	proofRequirements?: string[]
} {
	const expiresIn = params.expiresIn ?? 3600
	const expiry = Math.floor(Date.now() / 1000) + expiresIn

	return {
		buyer: params.buyer,
		taskClass: params.taskClass,
		intent: params.intent,
		...(params.constraints ? { constraints: params.constraints } : {}),
		maxPrice: params.maxPrice,
		expiry,
		...(params.proofRequirements ? { proofRequirements: params.proofRequirements } : {}),
	}
}
