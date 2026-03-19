import { execSync } from "node:child_process"
import { log } from "./output.js"

function findTempoCli(): string {
	try {
		const which = execSync("which tempo", { encoding: "utf-8" }).trim()
		if (which) return which
	} catch { /* not on PATH */ }

	const home = process.env.HOME ?? process.env.USERPROFILE ?? ""
	return `${home}/.tempo/bin/tempo`
}

export function resolveWallet(addressOverride: string | undefined, label: string) {
	if (addressOverride) {
		log(`[${label}] Wallet: ${addressOverride} (manual override)`)
		return { address: addressOverride }
	}

	const tempoCli = findTempoCli()

	try {
		const raw = execSync(`"${tempoCli}" wallet whoami`, { encoding: "utf-8" })
		const info = JSON.parse(raw)
		const address = info.wallet as string
		log(`[${label}] Wallet: ${address} (from Tempo)`)
		return { address }
	} catch {
		log(`[${label}] Error: Tempo wallet not available. Run: tempo wallet login`)
		log(`[${label}] Or pass --address to override.`)
		process.exit(1)
	}
}
