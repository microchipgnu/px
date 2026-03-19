import type { Attestation, AttestationCheck, BuyOrder, Fulfillment, TaskClass } from "@payload-exchange/protocol"
import { checkDeadline, checkProofPresent } from "./checks/common"
import { checkOnchainSwap } from "./checks/onchain-swap"
import { checkPriceFeed } from "./checks/price-feed"

type TaskClassVerifier = (fulfillment: Fulfillment, buyOrder: BuyOrder) => AttestationCheck[]

const verifiers: Partial<Record<TaskClass, TaskClassVerifier>> = {
	price_feed: checkPriceFeed,
	onchain_swap: checkOnchainSwap,
}

export function verify(
	fulfillment: Fulfillment,
	buyOrder: BuyOrder,
	attestorId = "attestor:coordinator-v1",
): Attestation {
	const checks: AttestationCheck[] = []

	// Common checks
	checks.push(checkDeadline(fulfillment, buyOrder))
	checks.push(checkProofPresent(fulfillment))

	// Task-class-specific checks
	const taskVerifier = verifiers[buyOrder.taskClass]
	if (taskVerifier) {
		checks.push(...taskVerifier(fulfillment, buyOrder))
	} else {
		// No verifier for this task class — pass with warning
		checks.push({
			name: "task_class_verifier",
			passed: true,
			value: `no verifier for ${buyOrder.taskClass}, auto-passing`,
		})
	}

	const success = checks.every((c) => c.passed)

	return {
		id: crypto.randomUUID(),
		orderId: buyOrder.id,
		success,
		checks,
		reason: success ? undefined : checks.filter((c) => !c.passed).map((c) => `${c.name}: ${c.value ?? "failed"}`).join("; "),
		attestors: [attestorId],
		timestamp: Math.floor(Date.now() / 1000),
		signatures: [`sig:${attestorId}:${Date.now()}`], // placeholder — real signing later
	}
}

export { checkPriceFeed } from "./checks/price-feed"
export { checkOnchainSwap } from "./checks/onchain-swap"
export { checkDeadline, checkProofPresent, checkSellerSignature } from "./checks/common"
