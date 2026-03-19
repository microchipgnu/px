import type { BuyOrder, SellOrder, TaskClass, PricingModel } from "./schema"

const now = () => Math.floor(Date.now() / 1000)
const uuid = () => crypto.randomUUID()
const future = (hours: number) => now() + hours * 3600
const pick = <T>(arr: T[]): T => arr[Math.floor(Math.random() * arr.length)]
const rand = (min: number, max: number) => Math.random() * (max - min) + min

// ─── Agent identities ──────────────────────────────────────────────────────

const AGENTS = [
	"agt:rebalancer.eth",
	"agt:defi-scout.sol",
	"agt:arb-hunter.base",
	"agt:yield-max.arb",
	"agt:portfolio.eth",
	"agt:sentinel.sol",
	"agt:data-pipe.base",
	"agt:swap-router.eth",
	"agt:bridge-bot.arb",
	"agt:monitor.sol",
	"agt:liquidator.eth",
	"agt:mev-guard.base",
	"agt:index-fund.eth",
	"agt:nft-sniper.sol",
	"agt:treasury.arb",
] as const

const SOLVERS = [
	"slv:1inch-relay",
	"slv:jupiter-agg",
	"slv:paraswap-v6",
	"slv:cowswap-solver",
	"slv:uniswap-x",
	"slv:wormhole-relay",
	"slv:layerzero-exec",
	"slv:chainlink-ccip",
	"slv:yearn-keeper",
	"slv:aave-liquidator",
	"slv:pyth-feed",
	"slv:the-graph-idx",
	"slv:gelato-automate",
	"slv:tenderly-sim",
	"slv:alchemy-webhook",
] as const

// ─── Intent templates ──────────────────────────────────────────────────────

type IntentTemplate = {
	taskClass: TaskClass
	intents: Array<() => { intent: string; constraints: Record<string, unknown>; price: [number, number] }>
}

const TOKENS = ["ETH", "SOL", "BTC", "ARB", "OP", "MATIC", "AVAX", "LINK", "UNI", "AAVE"]
const CHAINS = ["ethereum", "base", "arbitrum", "solana", "optimism", "polygon"]
const AMOUNTS = ["1,000", "5,000", "10,000", "25,000", "50,000", "100,000"]

const INTENT_TEMPLATES: IntentTemplate[] = [
	{
		taskClass: "onchain_swap",
		intents: [
			() => {
				const token = pick(TOKENS)
				const amount = pick(AMOUNTS)
				const chain = pick(CHAINS)
				return {
					intent: `Swap ${amount} USDC → ${token} on ${chain}, max 30bps slippage`,
					constraints: { chain, token, maxSlippage: 0.003 },
					price: [2, 15] as [number, number],
				}
			},
			() => {
				const from = pick(TOKENS)
				const to = pick(TOKENS.filter((t) => t !== from))
				return {
					intent: `Market sell ${pick(AMOUNTS)} ${from} → ${to}, best execution`,
					constraints: { bestExecution: true },
					price: [3, 20] as [number, number],
				}
			},
			() => {
				const token = pick(TOKENS)
				const price = Math.floor(rand(50, 5000))
				return {
					intent: `Limit buy ${token} at $${price}, fill-or-kill within 1h`,
					constraints: { limitPrice: price, timeInForce: "FOK" },
					price: [1, 8] as [number, number],
				}
			},
		],
	},
	{
		taskClass: "bridge",
		intents: [
			() => {
				const from = pick(CHAINS)
				const to = pick(CHAINS.filter((c) => c !== from))
				const amount = pick(AMOUNTS)
				return {
					intent: `Bridge ${amount} USDC from ${from} → ${to}, fastest route`,
					constraints: { sourceChain: from, destChain: to, priority: "speed" },
					price: [2, 12] as [number, number],
				}
			},
			() => {
				const token = pick(TOKENS)
				const from = pick(CHAINS)
				const to = pick(CHAINS.filter((c) => c !== from))
				return {
					intent: `Bridge + swap ${token} from ${from} to USDC on ${to}`,
					constraints: { sourceChain: from, destChain: to, token },
					price: [5, 25] as [number, number],
				}
			},
		],
	},
	{
		taskClass: "yield",
		intents: [
			() => {
				const token = pick(["USDC", "USDT", "DAI", "ETH", "SOL"])
				return {
					intent: `Find best ${token} yield across protocols, auto-deposit if APY > ${Math.floor(rand(3, 15))}%`,
					constraints: { token, minApy: rand(3, 15), autoDeposit: true },
					price: [1, 5] as [number, number],
				}
			},
			() => ({
				intent: `Rebalance LP positions across Uniswap V3 pools, optimize for fees`,
				constraints: { protocol: "uniswap-v3", strategy: "fee-optimization" },
				price: [5, 20] as [number, number],
			}),
			() => ({
				intent: `Harvest rewards from all active farms and compound into USDC`,
				constraints: { action: "harvest-compound", outputToken: "USDC" },
				price: [1, 8] as [number, number],
			}),
		],
	},
	{
		taskClass: "price_feed",
		intents: [
			() => {
				const token = pick(TOKENS)
				return {
					intent: `Real-time ${token}/USD price from 5+ sources, aggregated TWAP`,
					constraints: { token, sources: 5, method: "twap" },
					price: [0.1, 1] as [number, number],
				}
			},
			() => ({
				intent: `Gas price oracle: next 10 blocks prediction on ethereum + L2s`,
				constraints: { chains: ["ethereum", "base", "arbitrum"], blocks: 10 },
				price: [0.05, 0.5] as [number, number],
			}),
			() => ({
				intent: `DEX liquidity depth for ${pick(TOKENS)}/USDC across all venues`,
				constraints: { depth: "full", venues: "all" },
				price: [0.2, 1.5] as [number, number],
			}),
		],
	},
	{
		taskClass: "monitoring",
		intents: [
			() => {
				const token = pick(TOKENS)
				return {
					intent: `Alert if ${token} whale transfer > $1M detected on-chain`,
					constraints: { token, threshold: 1_000_000, type: "whale-alert" },
					price: [0.5, 3] as [number, number],
				}
			},
			() => ({
				intent: `Monitor governance proposals on Aave, Compound, Uniswap — notify on new`,
				constraints: { protocols: ["aave", "compound", "uniswap"], type: "governance" },
				price: [0.3, 2] as [number, number],
			}),
			() => ({
				intent: `Watch mempool for ${pick(TOKENS)} large orders, report pre-execution`,
				constraints: { type: "mempool-watch", minSize: 100_000 },
				price: [1, 5] as [number, number],
			}),
		],
	},
	{
		taskClass: "smart_contract",
		intents: [
			() => ({
				intent: `Execute batched token approvals + deposits into Aave V3`,
				constraints: { protocol: "aave-v3", action: "batch-deposit" },
				price: [2, 10] as [number, number],
			}),
			() => ({
				intent: `Claim and restake stETH rewards, optimize gas timing`,
				constraints: { protocol: "lido", action: "claim-restake" },
				price: [1, 6] as [number, number],
			}),
			() => ({
				intent: `Deploy token vesting contract with ${Math.floor(rand(2, 8))} beneficiaries`,
				constraints: { action: "deploy-vesting" },
				price: [10, 50] as [number, number],
			}),
		],
	},
	{
		taskClass: "search",
		intents: [
			() => ({
				intent: `Find arbitrage paths for ${pick(TOKENS)} across ${Math.floor(rand(3, 8))} DEXes`,
				constraints: { type: "arb-search", minProfit: 0.001 },
				price: [0.5, 3] as [number, number],
			}),
			() => ({
				intent: `Scan new token launches on ${pick(CHAINS)}, filter by liquidity > $100k`,
				constraints: { minLiquidity: 100_000, chain: pick(CHAINS) },
				price: [0.3, 2] as [number, number],
			}),
		],
	},
	{
		taskClass: "computation",
		intents: [
			() => ({
				intent: `Run backtesting on ETH/USDC mean-reversion strategy, 90d window`,
				constraints: { pair: "ETH/USDC", strategy: "mean-reversion", days: 90 },
				price: [5, 25] as [number, number],
			}),
			() => ({
				intent: `Calculate optimal portfolio weights for ${Math.floor(rand(5, 20))} assets, min-variance`,
				constraints: { strategy: "min-variance" },
				price: [3, 15] as [number, number],
			}),
		],
	},
]

// ─── Solver templates ──────────────────────────────────────────────────────

type SolverTemplate = {
	taskClasses: TaskClass[]
	terms: string
	pricingModel: PricingModel
	priceRange: [number, number]
	stakeRange: [number, number]
	repRange: [number, number]
	fulfilledRange: [number, number]
}

const SOLVER_TEMPLATES: SolverTemplate[] = [
	{
		taskClasses: ["onchain_swap"],
		terms: "All major DEXes. Sub-second routing. MEV-protected.",
		pricingModel: "fixed",
		priceRange: [1, 8],
		stakeRange: [1000, 10000],
		repRange: [0.88, 0.99],
		fulfilledRange: [500, 5000],
	},
	{
		taskClasses: ["onchain_swap", "bridge"],
		terms: "Cross-chain swaps via optimal bridge + DEX combo.",
		pricingModel: "percentage",
		priceRange: [0.03, 0.1],
		stakeRange: [2000, 15000],
		repRange: [0.85, 0.97],
		fulfilledRange: [200, 3000],
	},
	{
		taskClasses: ["bridge"],
		terms: "Wormhole, LayerZero, CCIP. Fastest finality guaranteed.",
		pricingModel: "fixed",
		priceRange: [2, 10],
		stakeRange: [5000, 20000],
		repRange: [0.9, 0.99],
		fulfilledRange: [800, 4000],
	},
	{
		taskClasses: ["yield"],
		terms: "Auto-compound across Aave, Compound, Yearn. Gas-optimized.",
		pricingModel: "percentage",
		priceRange: [0.01, 0.05],
		stakeRange: [500, 5000],
		repRange: [0.82, 0.95],
		fulfilledRange: [100, 1500],
	},
	{
		taskClasses: ["price_feed"],
		terms: "Pyth, Chainlink, Uniswap TWAP. 99.99% uptime SLA.",
		pricingModel: "fixed",
		priceRange: [0.05, 0.5],
		stakeRange: [200, 2000],
		repRange: [0.95, 0.99],
		fulfilledRange: [2000, 10000],
	},
	{
		taskClasses: ["monitoring"],
		terms: "Real-time chain indexing. Webhook + WS delivery. <500ms latency.",
		pricingModel: "fixed",
		priceRange: [0.2, 2],
		stakeRange: [300, 3000],
		repRange: [0.88, 0.96],
		fulfilledRange: [300, 2000],
	},
	{
		taskClasses: ["smart_contract"],
		terms: "Gelato-powered automation. Gas-optimized batching. Simulated first.",
		pricingModel: "dynamic",
		priceRange: [2, 15],
		stakeRange: [1000, 8000],
		repRange: [0.9, 0.98],
		fulfilledRange: [400, 2500],
	},
	{
		taskClasses: ["search", "computation"],
		terms: "GPU cluster. Backtesting, arb detection, portfolio optimization.",
		pricingModel: "dynamic",
		priceRange: [1, 10],
		stakeRange: [500, 5000],
		repRange: [0.8, 0.93],
		fulfilledRange: [100, 1000],
	},
	{
		taskClasses: ["onchain_swap", "bridge", "yield", "smart_contract"],
		terms: "Full-stack solver. Premium reliability. 24/7 execution.",
		pricingModel: "fixed",
		priceRange: [5, 20],
		stakeRange: [10000, 50000],
		repRange: [0.95, 0.99],
		fulfilledRange: [1000, 8000],
	},
	{
		taskClasses: ["price_feed", "monitoring", "search"],
		terms: "Data infrastructure. Indexing + alerts + search. Multi-chain.",
		pricingModel: "fixed",
		priceRange: [0.1, 1],
		stakeRange: [1000, 5000],
		repRange: [0.9, 0.97],
		fulfilledRange: [500, 3000],
	},
]

// ─── Generators ─────────────────────────────────────────────────────────────

export function generateBuyOrder(overrides?: Partial<BuyOrder>): BuyOrder {
	const template = pick(INTENT_TEMPLATES)
	const intentGen = pick(template.intents)
	const { intent, constraints, price } = intentGen()

	return {
		id: uuid(),
		buyer: pick([...AGENTS]),
		taskClass: template.taskClass,
		intent,
		constraints,
		maxPrice: Number.parseFloat(rand(price[0], price[1]).toFixed(2)),
		currency: "USDC",
		expiry: future(rand(0.5, 24)),
		proofRequirements: ["tx_hash"],
		status: "open",
		createdAt: now(),
		...overrides,
	}
}

export function generateSellOrder(overrides?: Partial<SellOrder>): SellOrder {
	const template = pick(SOLVER_TEMPLATES)
	const successRate = Number.parseFloat(rand(template.repRange[0], template.repRange[1]).toFixed(3))
	const totalFulfilled = Math.floor(rand(template.fulfilledRange[0], template.fulfilledRange[1]))

	return {
		id: uuid(),
		seller: pick([...SOLVERS]),
		supportedTaskClasses: template.taskClasses,
		pricingModel: template.pricingModel,
		price: Number.parseFloat(rand(template.priceRange[0], template.priceRange[1]).toFixed(2)),
		currency: "USDC",
		executionTerms: { description: template.terms },
		stake: Math.floor(rand(template.stakeRange[0], template.stakeRange[1])),
		reputation: {
			totalFulfilled,
			successRate,
			avgSettlementTime: `${Math.floor(rand(5, 30))}s`,
			disputes: Math.floor(rand(0, totalFulfilled * (1 - successRate) * 0.5)),
			slashes: Math.floor(rand(0, 3)),
		},
		status: "open",
		createdAt: now(),
		...overrides,
	}
}

// ─── Initial seed data ──────────────────────────────────────────────────────

export function generateInitialBuyOrders(count = 12): BuyOrder[] {
	return Array.from({ length: count }, (_, i) =>
		generateBuyOrder({ createdAt: now() - (count - i) * 15 }),
	)
}

export function generateInitialSellOrders(count = 10): SellOrder[] {
	return Array.from({ length: count }, (_, i) =>
		generateSellOrder({ createdAt: now() - (count - i) * 20 }),
	)
}
