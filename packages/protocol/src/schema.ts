import { z } from "zod"

// ─── Task Classes ───────────────────────────────────────────────────────────

export const TaskClass = z.enum([
	"onchain_swap",
	"bridge",
	"yield",
	"price_feed",
	"search",
	"computation",
	"monitoring",
	"smart_contract",
])

export type TaskClass = z.infer<typeof TaskClass>

// ─── Order Status ───────────────────────────────────────────────────────────

export const OrderStatus = z.enum([
	"open",
	"matched",
	"executing",
	"fulfilled",
	"attested",
	"settled",
	"disputed",
	"expired",
	"cancelled",
])

export type OrderStatus = z.infer<typeof OrderStatus>

// ─── Side ───────────────────────────────────────────────────────────────────

export const Side = z.enum(["buy", "sell"])
export type Side = z.infer<typeof Side>

// ─── Buy Order ──────────────────────────────────────────────────────────────

export const BuyOrder = z.object({
	id: z.string().uuid(),
	buyer: z.string(),
	taskClass: TaskClass,
	intent: z.string(),
	constraints: z.record(z.unknown()).optional(),
	maxPrice: z.number().positive(),
	currency: z.string().default("USDC"),
	expiry: z.number().int(),
	proofRequirements: z.array(z.string()).optional(),
	disputeWindow: z.number().int().optional(),
	parentOrderId: z.string().uuid().optional(),
	status: OrderStatus.default("open"),
	createdAt: z.number().int(),
	signature: z.string().optional(),
})

export type BuyOrder = z.infer<typeof BuyOrder>

// ─── Reputation ─────────────────────────────────────────────────────────────

export const Reputation = z.object({
	totalFulfilled: z.number().int().nonnegative().default(0),
	successRate: z.number().min(0).max(1).default(0.5),
	avgSettlementTime: z.string().default("0s"),
	disputes: z.number().int().nonnegative().default(0),
	slashes: z.number().int().nonnegative().default(0),
})

export type Reputation = z.infer<typeof Reputation>

// ─── Sell Order ─────────────────────────────────────────────────────────────

export const PricingModel = z.enum(["fixed", "percentage", "auction", "dynamic"])
export type PricingModel = z.infer<typeof PricingModel>

export const SellOrder = z.object({
	id: z.string().uuid(),
	seller: z.string(),
	supportedTaskClasses: z.array(TaskClass),
	pricingModel: PricingModel,
	price: z.number().nonnegative(),
	currency: z.string().default("USDC"),
	executionTerms: z.record(z.unknown()).optional(),
	stake: z.number().nonnegative().default(0),
	reputation: Reputation.default({}),
	status: OrderStatus.default("open"),
	createdAt: z.number().int(),
	signature: z.string().optional(),
})

export type SellOrder = z.infer<typeof SellOrder>

// ─── Fulfillment ────────────────────────────────────────────────────────────

export const Fulfillment = z.object({
	id: z.string().uuid(),
	orderId: z.string().uuid(),
	sellerId: z.string(),
	result: z.unknown(),
	proof: z.record(z.unknown()).optional(),
	executionTime: z.string().optional(),
	timestamp: z.number().int(),
	sellerSignature: z.string().optional(),
})

export type Fulfillment = z.infer<typeof Fulfillment>

// ─── Attestation ────────────────────────────────────────────────────────────

export const AttestationCheck = z.object({
	name: z.string(),
	passed: z.boolean(),
	value: z.unknown().optional(),
})

export type AttestationCheck = z.infer<typeof AttestationCheck>

export const Attestation = z.object({
	id: z.string().uuid(),
	orderId: z.string().uuid(),
	success: z.boolean(),
	checks: z.array(AttestationCheck).optional(),
	reason: z.string().optional(),
	attestors: z.array(z.string()),
	timestamp: z.number().int(),
	signatures: z.array(z.string()),
})

export type Attestation = z.infer<typeof Attestation>

// ─── Settlement ─────────────────────────────────────────────────────────────

export const Settlement = z.object({
	id: z.string().uuid(),
	orderId: z.string().uuid(),
	buyerPaid: z.number(),
	sellerReceived: z.number(),
	networkFee: z.number(),
	currency: z.string(),
	method: z.string().optional(),
	timestamp: z.number().int(),
	txHash: z.string().optional(),
})

export type Settlement = z.infer<typeof Settlement>

// ─── Activity Event ─────────────────────────────────────────────────────────

export const ActivityEventType = z.enum([
	"order_placed",
	"order_matched",
	"execution_started",
	"fulfillment_submitted",
	"attestation_passed",
	"attestation_failed",
	"settlement_complete",
	"order_expired",
	"order_cancelled",
	"solver_joined",
])

export type ActivityEventType = z.infer<typeof ActivityEventType>

export type ActivityEvent = {
	id: string
	type: ActivityEventType
	timestamp: number
	orderId?: string
	buyer?: string
	seller?: string
	taskClass?: TaskClass
	intent?: string
	price?: number
	detail?: string
}
