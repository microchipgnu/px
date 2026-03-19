import type { AttestationCheck } from "@payload-exchange/protocol"
import type { BuyOrder } from "@payload-exchange/protocol"
import type { Fulfillment } from "@payload-exchange/protocol"

export function checkDeadline(fulfillment: Fulfillment, buyOrder: BuyOrder): AttestationCheck {
	const withinDeadline = fulfillment.timestamp <= buyOrder.expiry
	return {
		name: "deadline",
		passed: withinDeadline,
		value: withinDeadline ? undefined : `fulfilled at ${fulfillment.timestamp}, deadline was ${buyOrder.expiry}`,
	}
}

export function checkProofPresent(fulfillment: Fulfillment): AttestationCheck {
	const hasProof = fulfillment.proof != null && Object.keys(fulfillment.proof).length > 0
	return {
		name: "proof_present",
		passed: hasProof,
	}
}

export function checkSellerSignature(fulfillment: Fulfillment): AttestationCheck {
	// v1: just check that a signature exists. Real verification comes later.
	const hasSig = fulfillment.sellerSignature != null && fulfillment.sellerSignature.length > 0
	return {
		name: "seller_signature",
		passed: hasSig,
	}
}
