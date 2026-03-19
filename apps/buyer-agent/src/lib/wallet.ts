import { privateKeyToAccount, generatePrivateKey } from "viem/accounts"
import { log } from "./output.js"

export function resolveWallet(key: string | undefined, label: string) {
	const privateKey = (key ?? generatePrivateKey()) as `0x${string}`
	const account = privateKeyToAccount(privateKey)
	const hasKey = !!key

	if (!hasKey) {
		log(`[${label}] No --key set — generated ephemeral wallet (cannot pay via MPP)`)
	}

	return { privateKey, account, address: account.address, hasKey }
}
