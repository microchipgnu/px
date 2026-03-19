import type { AttestationCheck, BuyOrder, Fulfillment } from "@payload-exchange/protocol"

// Stub — real implementation requires on-chain RPC calls to verify tx existence,
// confirmation count, recipient address, slippage, etc.
export function checkOnchainSwap(_fulfillment: Fulfillment, _buyOrder: BuyOrder): AttestationCheck[] {
	return [
		{ name: "tx_exists", passed: false, value: "on-chain verification not implemented" },
	]
}
