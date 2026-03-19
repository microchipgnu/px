import { Mppx, tempo } from "mppx/server"

const TESTNET = process.env.TEMPO_TESTNET !== "false" // default to testnet
const RECIPIENT = (process.env.TEMPO_RECIPIENT ?? "0x94301AA7A865B18A69BB6C60d64F45ab16D30C91") as `0x${string}`
const CURRENCY = (process.env.TEMPO_CURRENCY ?? "0x20c0000000000000000000000000000000000000") as `0x${string}` // pathUSD

const SECRET_KEY = process.env.MPP_SECRET_KEY ?? "payload-exchange-dev-secret-key"

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- Mppx.create return type is too deep for TS to name portably
export const mppx: any = Mppx.create({
	methods: [
		tempo({
			testnet: TESTNET,
			currency: CURRENCY,
			recipient: RECIPIENT,
		}),
	],
	secretKey: SECRET_KEY,
	realm: "payload.exchange",
})

export { RECIPIENT, CURRENCY, TESTNET }
