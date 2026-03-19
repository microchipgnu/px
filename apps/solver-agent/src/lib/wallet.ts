import { privateKeyToAccount, generatePrivateKey } from "viem/accounts"
import { log } from "./output.js"

export function resolveWallet(key: string | undefined, label: string) {
	const hasKey = !!key && key.length > 0
	const privateKey = (hasKey ? key : generatePrivateKey()) as `0x${string}`
	const account = privateKeyToAccount(privateKey)

	if (!hasKey) {
		log(`[${label}] No --key set — generated ephemeral wallet`)
	}

	return { privateKey, account, address: account.address, hasKey }
}
