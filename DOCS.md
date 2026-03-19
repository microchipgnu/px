# Payload Exchange — Technical Documentation

Detailed protocol design, architecture, schemas, MPP integration, open problems, and roadmap.

For quick start and usage, see [README.md](README.md).

---

## Table of Contents

- [The Problem](#the-problem)
- [The Thesis](#the-thesis)
- [How It Works](#how-it-works)
- [MPP: The Settlement Layer](#mpp-the-settlement-layer)
- [Entities](#entities)
- [Architecture](#architecture)
- [The Coordination Layer Roadmap](#the-coordination-layer-roadmap)
- [Task-as-Value: Composable & Tradable Intents](#task-as-value-composable--tradable-intents)
- [Open Problems](#open-problems)
- [Strengths and Weaknesses](#strengths-and-weaknesses)
- [TODO](#todo)

---

## The Problem

Today's agent economy is plumbing. Every agent-to-agent interaction is hardwired: direct API calls, static integrations, fixed pricing. There's no way for an agent to say *"I want X done, here's $Y"* and have the market figure out who does it best.

Everything being built right now is **payment-enabled experiences** — pay-per-query, pay-per-image, pay-per-token. These are just API monetization.

Payload Exchange is **market-enabled execution**. The difference is coordination.

## The Thesis

> Agents will not just call APIs directly. They will increasingly express **intents**. Other agents, services, and operators will **compete** to fulfill those intents. A coordination layer will be needed to **match demand, verify outcomes, and settle value**.

That coordination layer is Payload Exchange.

## How It Works

### Three Actors

**Buy Side** — Entities that want an outcome. They submit signed intents: desired result, constraints, max price, expiry, and proof requirements.

```
"Swap 10k USDC into ETH under 30 bps slippage before 18:00 UTC — up to $8 fee."
"Find me 3 flights under $900 matching these constraints — up to $2."
```

**Sell Side** — Entities that can fulfill outcomes. They advertise capabilities, pricing models, execution terms, stake, and reputation.

```
"I fulfill swaps on Base, Solana, Arbitrum. Fixed fee."
"I do travel search tasks. Dynamic pricing, 98.5% success rate."
```

**Network (Coordination Layer)** — The protocol in the middle. It handles three distinct jobs:

1. **Discovery & Matching** — Who gets assigned to the order
2. **Verification & Attestation** — Was the order actually fulfilled according to its rules
3. **Settlement & Dispute Resolution** — Who gets paid and when

### The Full Lifecycle

An intent moves through six stages. Each stage has clear inputs, outputs, and failure modes.

```
open → matched → executing → fulfilled → attested → settled
                                       ↘ disputed → resolved
                               ↘ expired
                     ↘ cancelled
```

---

#### Stage 1: Intent Submission (`open`)

A buyer posts a signed intent to the orderbook. This is a declaration of demand — *"I want X done and I'll pay up to $Y."*

```typescript
buy_order = {
  id:                "ord_8f3a...",
  buyer:             "0xAlice...",
  taskClass:         "onchain_swap",
  intent:            "Swap 10k USDC → ETH on Base",
  constraints: {
    maxSlippage:     0.003,            // 30 bps
    chains:          ["base"],
    deadline:        1742403600,        // unix timestamp
  },
  maxPrice:          8.00,             // max fee in USDC
  currency:          "USDC",
  expiry:            1742403600,        // unix timestamp
  proofRequirements: ["tx_hash", "block_confirmation"],
  disputeWindow:     3600,             // 1 hour in seconds
  status:            "open",
  createdAt:         1742399700,
  signature:         "0xSig...",        // buyer signs the full order
}
```

The signature makes the intent non-repudiable — the buyer can't deny they posted it. The `maxPrice` acts as a ceiling, not a fixed fee. Solvers compete below it.

**Critical: intents are submitted off-chain.** The signed intent is sent directly to the coordinator over TLS — it is never posted on-chain or broadcast publicly. If it were, it would become a bearer instrument: anyone who sees it could race to fulfill it and claim payment, front-run solvers, or extract demand information. See [The Signing Problem](#the-signing-problem-intents-cannot-be-on-chain) for details.

At this point, the buyer's payment is **not yet committed**. No funds move until a match is made and execution begins. The order signature is a *protocol-level* authorization — it commits the buyer to pay up to `maxPrice` if the intent is fulfilled. The actual *payment-level* authorization happens later via MPP when the buyer's agent responds to a 402 challenge at settlement time. These are two distinct steps: the order signature says "I want this done and I'll pay for it," the MPP credential says "here's the payment." The signature alone cannot move funds — only the buyer's active response to a 402 challenge can.

**Failure mode:** If no solver picks up the intent before `expiry`, it transitions to `expired`. The buyer pays nothing.

---

#### Stage 2: Discovery & Matching (`matched`)

Solvers monitor the orderbook for intents they can fulfill. A solver has a standing sell order — a persistent advertisement of what it can do:

```typescript
sell_order = {
  id:                    "sol_2b7c...",
  seller:                "0xBotSwap...",
  supportedTaskClasses:  ["onchain_swap", "bridge"],
  pricingModel:          "dynamic",       // fixed | percentage | auction | dynamic
  price:                 5.00,            // current quoted fee
  currency:              "USDC",
  executionTerms: {
    description:         "All major DEXes. Sub-second routing. MEV-protected.",
    avgExecutionTime:    "12s",
    supportedChains:     ["base", "arbitrum", "solana"],
    maxOrderSize:        100000,
  },
  stake:                 500,             // USDC bonded as guarantee
  reputation: {
    totalFulfilled:      1847,
    successRate:         0.994,
    avgSettlementTime:   "14s",
    disputes:            3,
    slashes:             0,
  },
  status:                "open",
  createdAt:             1742399400,
  signature:             "0xSig...",
}
```

The network matches buyers to sellers using one of three mechanisms:

**Direct Match** — First solver whose offer satisfies the intent's constraints at or below `maxPrice` gets assigned. Fastest. Used when speed matters more than price optimization.

**RFQ (Request for Quote)** — The network broadcasts the intent to eligible solvers. Each responds with a binding quote. The best quote wins. Used for large orders or when price discovery matters.

```
Intent posted → broadcast to eligible solvers
  ├─ Solver A quotes: $5.20, 10s execution
  ├─ Solver B quotes: $4.80, 15s execution
  └─ Solver C quotes: $6.00, 8s execution
Network selects Solver B (best price within constraints)
```

**Auction (Dutch / English)** — The fee starts high and drops over time (Dutch), or solvers bid against each other (English). Used for competitive markets with many solvers. The spread between `maxPrice` and the winning bid is savings returned to the buyer — or captured as network revenue.

Once matched, the network creates an **execution assignment**:

```typescript
assignment = {
  orderId:      "ord_8f3a...",
  sellerId:     "sol_2b7c...",
  agreedPrice:  4.80,
  deadline:     1742403600,
  createdAt:    1742399700,
}
```

At this point, the buyer's payment authorization is **locked** to this specific solver and price. The solver's stake is at risk — if they fail to deliver, they can be slashed.

**Failure mode:** If the matched solver doesn't begin execution within the assignment window, the order returns to `open` and the solver's reputation takes a hit.

---

#### Stage 3: Execution (`executing`)

The solver does the actual work. What "execution" means depends entirely on the task class:

| Task Class | What the solver actually does |
|------------|------------------------------|
| `onchain_swap` | Submits a swap transaction on-chain (DEX aggregator, AMM, etc.) |
| `bridge` | Initiates cross-chain transfer, waits for confirmation on both chains |
| `yield` | Deposits into yield protocol, returns position receipt |
| `price_feed` | Queries price sources, aggregates, returns signed price attestation |
| `search` | Runs search queries across sources, ranks results, returns structured data |
| `computation` | Executes compute job (ML inference, simulation, analysis), returns output |
| `monitoring` | Sets up monitoring hooks, streams alerts over session |
| `smart_contract` | Deploys or calls contract, returns tx hash + ABI output |

The solver works off-chain, on-chain, or both — the protocol doesn't prescribe how. It only cares about the **result and proof**.

For long-running tasks, the solver can post progress updates to the network. For streaming tasks (monitoring, data feeds), the buyer opens an MPP session with the solver — depositing into escrow and paying per-update via off-chain vouchers. The solver delivers results and drains the channel incrementally instead of settling each interaction on-chain.

**Failure mode:** If the solver can't complete execution before the deadline, the order moves to `expired`. The solver's stake may be partially slashed depending on how far execution progressed and the task class rules.

---

#### Stage 4: Fulfillment Submission (`fulfilled`)

The solver submits the result back to the network with proof of completion:

```typescript
fulfillment = {
  id:               "ful_9d2e...",
  orderId:          "ord_8f3a...",
  sellerId:         "sol_2b7c...",
  result: {
    txHash:         "0xabc123...",
    amountOut:      "5.24 ETH",
    executedPrice:  1908.32,
    chain:          "base",
    block:          18847291,
  },
  proof: {
    type:           "tx_confirmation",
    txHash:         "0xabc123...",
    blockHash:      "0xdef456...",
    confirmations:  3,
    receipt:        "0x...",       // serialized tx receipt
  },
  executionTime:    "11s",
  timestamp:        1742400311,
  sellerSignature:  "0xSig...",
}
```

The `proof` object is task-class-specific. The `proofRequirements` field from the original buy order defines what proof is needed:

| Proof Type | What it contains | Used by |
|------------|------------------|---------|
| `tx_hash` | On-chain transaction hash | `onchain_swap`, `bridge`, `yield`, `smart_contract` |
| `block_confirmation` | Block hash + confirmation count | `onchain_swap`, `bridge` |
| `signed_response` | API response body signed by the solver | `price_feed`, `search`, `computation` |
| `merkle_proof` | Inclusion proof in a data structure | `computation`, `monitoring` |
| `body_digest` | SHA-256 hash of result body (RFC 9530) | Any — binds result to specific content |
| `attestor_signature` | Third-party co-signature on the result | Semi-verifiable tasks |

The solver signs the entire fulfillment object. This makes it non-repudiable — the solver can't deny what they delivered.

**Failure mode:** If the fulfillment is submitted after the deadline, or the proof doesn't match the `proofRequirements`, the fulfillment is rejected and the order moves to `disputed`.

---

#### Stage 5: Attestation (`attested`)

This is the hardest and most important stage. The attestation layer answers one question:

> *"Was the intent actually fulfilled according to the buyer's constraints?"*

The network does not blindly trust the solver's proof. It verifies.

**For objectively verifiable tasks** (v1 — the starting point):

The network runs deterministic checks. No human judgment needed.

```
Attestation checklist for onchain_swap:
  ✓ tx_hash exists on chain
  ✓ tx is confirmed (≥ required confirmations)
  ✓ recipient matches buyer's address
  ✓ output amount matches within slippage tolerance
  ✓ execution happened before deadline
  ✓ chain matches constraint
```

If all checks pass:

```typescript
attestation = {
  id:               "att_4f1b...",
  orderId:          "ord_8f3a...",
  success:          true,
  checks: [
    { name: "tx_exists",      passed: true },
    { name: "confirmations",  passed: true, value: 3 },
    { name: "slippage",       passed: true, value: 0.0021 },
    { name: "deadline",       passed: true },
    { name: "chain_match",    passed: true },
  ],
  attestors:        ["0xAttestor1...", "0xAttestor2..."],
  timestamp:        1742400325,
  signatures:       ["0xSig1...", "0xSig2..."],
}
```

**For semi-verifiable tasks** (Phase 2):

The network combines rule-based checks with attestor judgment. A council of attestors reviews the fulfillment and votes:

```
Intent: "Find 3 flights under $900 LIS→TYO"
Fulfillment: [flight1, flight2, flight3]

Rule checks:
  ✓ Exactly 3 results returned
  ✓ All prices < $900
  ✓ All routes match LIS→TYO

Attestor judgment:
  ? Are these real flights? (not hallucinated)
  ? Are prices current? (not cached/stale)
  ? Is this "best effort" search? (not just first 3 results)

Council votes: 3/4 approve → attested
```

**For subjective tasks** (future):

Requires evaluation frameworks, rubrics, or market-based dispute resolution. Not in scope for v1.

**Failure mode:** If attestation fails, the order moves to `disputed`. The solver can challenge the attestation, provide additional proof, or accept the result. The dispute window (defined in the original order) determines how long the solver has to respond.

---

#### Stage 6: Settlement (`settled`)

Once attestation passes, payment flows automatically through MPP.

```typescript
settlement = {
  orderId:          "ord_8f3a...",
  buyerPaid:        4.80,           // agreed price, not maxPrice
  sellerReceived:   4.56,           // after network fee
  networkFee:       0.24,           // 5% take rate
  currency:         "USDC",
  method:           "tempo",
  txHash:           "0xsettle789...",
  timestamp:        1742400326,
}
```

**The three-party settlement model:**

MPP is a client-server protocol — the client initiates, the server responds with a 402 challenge. In Payload Exchange, the network sits between buyer and solver. For v1 (centralized operator), settlement uses the **network-as-escrow** model with two MPP flows:

```
Flow 1: Buyer pays network
─────────────────────────
1. Buyer's agent requests the fulfillment result
   → GET /orders/{id}/result

2. Network responds 402 + Challenge
   → amount: 4.80, recipient: network address, method: "tempo"

3. Buyer's agent constructs Credential for this specific challenge
   → signs payment authorization against the challenge ID

4. Buyer's agent retries with Credential
   → Authorization: Payment <credential>

5. Network verifies credential, settles on Tempo
   → USDC moves: buyer → network

6. Network returns fulfillment result + Receipt to buyer
   → 200 + Payment-Receipt + result body

Flow 2: Network pays solver
───────────────────────────
7. Network transfers agreed amount minus fee to solver
   → direct Tempo transfer: 4.56 USDC to solver address

8. Solver's stake is unlocked
```

The buyer always **initiates** — MPP doesn't support server-push payment requests. The buyer's agent polls for result readiness, and when the result is available, the 402 challenge fires. The buyer's MPP credential is constructed in response to this specific challenge (referencing its unique ID) — it cannot be pre-authorized at match time.

The buyer pays the **agreed price** from matching (not their `maxPrice` ceiling). The network holds the payment briefly, deducts its fee, and forwards the remainder to the solver. For v1, the network has temporary custody. Later phases can replace this with smart contract escrow on Tempo that splits automatically.

For session-based tasks (monitoring, streaming), the buyer opens an MPP session directly with the solver at match time — depositing into an escrow channel. The solver drains the channel by delivering updates (off-chain vouchers), with periodic on-chain settlement. The network handles matching and attestation but doesn't sit in the payment path for streaming data.

**Failure mode:** If MPP settlement fails (network issue, insufficient funds), the order enters a retry loop with exponential backoff. If settlement can't complete within the dispute window, the order moves to `disputed`.

---

#### Dispute Resolution

Disputes can arise from:

- Attestation failure (solver claims they fulfilled, network disagrees)
- Partial fulfillment (solver did some but not all of the work)
- Timeout (solver was matched but never delivered)
- Settlement failure (payment couldn't be processed)

The dispute flow:

```
disputed
  ├─ Solver submits additional proof → re-attestation
  ├─ Buyer accepts partial result → partial settlement
  ├─ Council votes on outcome → full settlement or slash
  └─ Dispute window expires → default to attestation result
```

Stakes make disputes expensive. A solver with 500 USDC staked who fails to fulfill a 4.80 USDC order doesn't just lose the fee — they risk a slash proportional to the severity. This asymmetry is intentional: it makes the cost of cheating far higher than the reward.

---

### Order Schema Reference

These match the Zod schemas in `packages/protocol/src/schema.ts`.

**Buy Order (Intent)**

```typescript
{
  id:                string,          // UUID
  buyer:             string,          // buyer's address
  taskClass:         TaskClass,       // what kind of work
  intent:            string,          // human-readable description
  constraints?:      Record<string, unknown>,  // task-specific rules
  maxPrice:          number,          // ceiling in USDC — solvers compete below this
  currency:          string,          // settlement currency (default: "USDC")
  expiry:            number,          // unix timestamp deadline
  proofRequirements?: string[],       // what proof the solver must provide
  disputeWindow?:    number,          // seconds — how long disputes can be raised
  parentOrderId?:    string,          // UUID — for recursive intents
  status:            OrderStatus,     // default: "open"
  createdAt:         number,          // unix timestamp
  signature?:        string,          // buyer signs the full order
}
```

**Sell Order (Offer)**

```typescript
{
  id:                    string,       // UUID
  seller:                string,
  supportedTaskClasses:  TaskClass[],
  pricingModel:          "fixed" | "percentage" | "auction" | "dynamic",
  price:                 number,       // fee in USDC
  currency:              string,       // default: "USDC"
  executionTerms?:       Record<string, unknown>,  // { description, ... }
  stake:                 number,       // USDC bonded as guarantee (default: 0)
  reputation: {
    totalFulfilled:      number,       // total orders completed
    successRate:         number,       // 0–1
    avgSettlementTime:   string,       // e.g. "14s"
    disputes:            number,       // total dispute count
    slashes:             number,       // total slash count
  },
  status:                OrderStatus,  // default: "open"
  createdAt:             number,       // unix timestamp
  signature?:            string,
}
```

**Fulfillment**

```typescript
{
  id:                string,          // UUID
  orderId:           string,          // references buy order
  sellerId:          string,
  result:            unknown,         // task-class-specific output
  proof?:            Record<string, unknown>,  // matches proofRequirements
  executionTime?:    string,          // e.g. "11s"
  timestamp:         number,          // unix timestamp
  sellerSignature?:  string,
}
```

**Attestation**

```typescript
{
  id:                string,          // UUID
  orderId:           string,
  success:           boolean,
  checks?:           { name: string, passed: boolean, value?: unknown }[],
  reason?:           string,          // if failed — why
  attestors:         string[],        // attestor addresses
  timestamp:         number,          // unix timestamp
  signatures:        string[],        // attestor signatures (parallel to attestors)
}
```

**Settlement**

```typescript
{
  id:                string,          // UUID
  orderId:           string,
  buyerPaid:         number,
  sellerReceived:    number,
  networkFee:        number,
  currency:          string,
  method?:           string,          // MPP payment method used
  timestamp:         number,          // unix timestamp
  txHash?:           string,
}
```

### Task Classes

Not all tasks are created equal. Payload Exchange defines task classes by how verifiable their outcomes are:

| Class | Verification | Examples | v1 Support |
|-------|-------------|----------|------------|
| **Objectively verifiable** | Cryptographic proof, on-chain confirmation | Swaps, bridges, payments, API responses | Yes |
| **Semi-verifiable** | Rules + attestor judgment | Search/ranking, market research, routing | Planned |
| **Subjective** | Human/agent evaluation | Creative work, strategy, design | Future |

Current task classes: `onchain_swap`, `bridge`, `yield`, `price_feed`, `search`, `computation`, `monitoring`, `smart_contract`.

## MPP: The Settlement Layer

[MPP (Machine Payments Protocol)](https://mpp.dev) is the open standard for machine-to-machine payments over HTTP. Payload Exchange uses MPP as its settlement primitive — every intent that resolves into payment flows through MPP's challenge-credential-receipt cycle.

### Why MPP

- **Protocol-native payments** — The 402 challenge/response pattern maps directly to intent settlement. No OAuth, no API keys, no signup flows.
- **Sub-100ms settlement** — MPP sessions use off-chain vouchers for high-throughput, low-cost interactions. Critical for agent-speed markets.
- **Payment-method agnostic** — Stablecoins (Tempo), cards (Stripe), Lightning — the orderbook doesn't care how value moves, just that it does.
- **Built for agents** — MPP was designed for programmatic access. So was this.

Under the hood, settlement flows through [Tempo](https://tempo.xyz) on testnet — deterministic finality, low fees, USDC/USDT stablecoins.

### The 402 Protocol Flow

MPP standardizes HTTP `402 Payment Required` with three objects that move between client and server:

```
Buyer Agent                    Payload Exchange                    Seller Agent
     │                               │                                  │
     │  GET /orders/{id}/result      │                                  │
     │──────────────────────────────→│                                  │
     │                               │                                  │
     │  402 + Challenge              │  (result ready, attestation      │
     │←──────────────────────────────│   passed — payment required)     │
     │                               │                                  │
     │  GET /orders/{id}/result      │                                  │
     │  + Authorization: Payment     │                                  │
     │──────────────────────────────→│                                  │
     │                               │  Verify credential               │
     │                               │  Settle on Tempo                 │
     │                               │  Transfer to solver ────────────→│
     │                               │                                  │
     │  200 + Receipt + Result       │                                  │
     │←──────────────────────────────│                                  │
```

### Challenge (Server → Client)

Issued as `WWW-Authenticate: Payment` header on a 402 response. Tells the buyer what to pay.

```
WWW-Authenticate: Payment id="<uuid>", method="tempo", intent="charge",
  request="<base64url-json>", digest="sha-256=:<hash>:",
  realm="payload.exchange", expires="<iso8601>"
```

| Field | Type | Description |
|-------|------|-------------|
| `id` | UUID | Unique challenge ID — replay protection, single-use |
| `method` | string | Payment method (`tempo`, `stripe`, `lightning`, `card`) |
| `intent` | string | Payment type (`charge` or `session`) |
| `request` | object | Method-specific params: `amount`, `currency`, `recipient`, `description`, `externalId` |
| `digest` | string | RFC 9530 body digest — binds payment to specific request body |
| `realm` | string | Authentication realm |
| `expires` | ISO 8601 | Challenge expiration |

### Credential (Client → Server)

Submitted as `Authorization: Payment` header. Proves the buyer paid.

```
Authorization: Payment <base64url-json>
```

| Field | Type | Description |
|-------|------|-------------|
| `challengeId` | UUID | References the Challenge `id` |
| `payload` | object | Method-specific proof (tx signature, payment token, preimage, voucher) |

### Receipt (Server → Client)

Returned as `Payment-Receipt` header on 200 response. Confirms settlement.

```
Payment-Receipt: <base64url-json>
```

| Field | Type | Description |
|-------|------|-------------|
| `challengeId` | UUID | Echoes the Challenge `id` |
| `settled` | ISO 8601 | Settlement timestamp |
| `confirmation` | object | Network-specific confirmation (tx hash, block, etc.) |

### Payment Intents

MPP defines two intent types. Payload Exchange uses both:

**Charge** — One-time immediate payment. One challenge, one credential, one receipt. Used for fixed-cost task fulfillment.

| Field | Type | Required |
|-------|------|----------|
| `amount` | string | Yes |
| `currency` | string | Yes |
| `description` | string | No |
| `expires` | ISO 8601 | No |
| `externalId` | string | No |
| `recipient` | string | No |

**Session** — Streaming payment channel. Client deposits into escrow, then sends off-chain signed vouchers per request. Sub-100ms latency, near-zero per-request fees. Used for high-frequency task execution (monitoring, streaming data, recursive sub-tasks).

| Field | Type | Required |
|-------|------|----------|
| `amount` | string | Yes |
| `unitType` | string | No |
| `suggestedDeposit` | string | No |

Session flow:
```
1. Client receives 402 + session challenge
2. Client opens payment channel on-chain (deposits funds into escrow)
3. Client sends requests with off-chain voucher signatures
4. Server validates voucher, returns resource — no 402 needed
5. Server periodically settles accumulated vouchers on-chain
6. Client closes session (final settlement)
```

When SSE streaming is enabled (`sse: true`), the server emits `payment-need-voucher` events if the channel balance depletes mid-stream, allowing the client to top up without interrupting the response.

### Payment Methods

MPP is method-agnostic. The orderbook doesn't care how value moves — it cares that it does.

#### Tempo (primary — testnet)

Stablecoin payments on Tempo Network. Deterministic finality, low fees, USDC/USDT.

```typescript
// Server
import { Mppx, tempo } from "mppx/server"

const mppx = Mppx.create({
  methods: [tempo({
    currency: "0x20c0...",  // pathUSD token address
    recipient: "0xf39F...", // payment recipient
    sse: true,              // enable streaming
  })]
})
```

```typescript
// Client
import { Mppx, tempo } from "mppx/client"

const mppx = Mppx.create({
  methods: [tempo({
    account: privateKeyToAccount("0x..."),
    maxDeposit: "1",  // max pathUSD locked per channel
  })]
})
```

| Config (Server) | Description |
|-----------------|-------------|
| `currency` | Token address (e.g., pathUSD) |
| `recipient` | Receiving address |
| `chainId` | Blockchain network ID |
| `feePayer` | Whether server pays gas |
| `sse` | Enable Server-Sent Events for streaming |

| Config (Client) | Description |
|-----------------|-------------|
| `account` | Private key account for signing |
| `maxDeposit` | Max tokens to lock in payment channel |
| `chainId` | Blockchain network ID |

#### Stripe

Card payments via Stripe infrastructure. Fraud and dispute handling included.

```typescript
// Server
import { Mppx, stripe } from "mppx/server"

const mppx = Mppx.create({
  methods: [stripe({
    client: stripeInstance,
    networkId: "...",
    paymentMethodTypes: ["card"],
  })]
})
```

#### Lightning

Bitcoin payments over Lightning Network. Near-instant finality via BOLT11 invoices.

#### Card

Encrypted network payment tokens for machine-initiated card transactions (e.g., Visa Intelligent Commerce).

#### Custom

Any payment method can be implemented by defining `request` schema, `payload` schema, verification procedure, and settlement procedure. Method identifiers are lowercase ASCII strings.

### mppx SDK Reference

The `mppx` package provides TypeScript implementations for both sides.

#### Server (`mppx/server`)

```typescript
// Create payment handler
const mppx = Mppx.create({ methods: PaymentMethod[] })

// Gate a route with one-time payment
mppx.charge({
  amount: string,
  currency?: string,
  description?: string,
  decimals?: number,
  externalId?: string,   // idempotency key
  expires?: string,
}): (request: Request) => Promise<PaymentResult>

// Gate a route with streaming session
mppx.session({
  amount: string,         // per-unit cost
  unitType?: string,
  description?: string,
  suggestedDeposit?: string,
}): (request: Request) => Promise<PaymentResult>

// PaymentResult
interface PaymentResult {
  status: 200 | 402 | 403
  challenge: Response                          // the 402 response
  withReceipt(handler: ResponseHandler): Response  // wrap response with receipt
}
```

Framework adapters:

```typescript
// Next.js
import { Mppx, tempo } from "mppx/nextjs"
export const GET = mppx.charge({ amount: "0.01" })(handler)

// Hono
import { Mppx, tempo } from "mppx/hono"
app.get("/path", mppx.charge({ amount: "0.01" }), handler)

// Express
import { Mppx, tempo } from "mppx/express"
app.get("/path", mppx.charge({ amount: "0.01" }), handler)

// Elysia
import { Mppx, tempo } from "mppx/elysia"
app.get("/path", mppx.charge({ amount: "0.01" }), handler)
```

#### Client (`mppx/client`)

```typescript
// Create payment-aware fetch — automatically handles 402 responses
const mppx = Mppx.create({ methods: PaymentMethod[] })
const response = await mppx("https://endpoint/resource")

// Session management
const session = tempo.session({ account, maxDeposit: "1" })
const res = await session.fetch(url)              // single request
const stream = await session.sse(url)             // SSE stream
for await (const chunk of stream) { /* ... */ }
await session.close()                             // final settlement

// Restore original fetch
Mppx.restore()
```

#### Core Primitives

```typescript
// Challenge
Challenge.from(data): Challenge
Challenge.serialize(): string
Challenge.deserialize(header: string): Challenge
Challenge.fromResponse(response: Response): Challenge | null
Challenge.verify(signature: string): boolean
Challenge.meta(): ChallengeMetadata

// Credential
Credential.from(proof): Credential
Credential.serialize(): string
Credential.deserialize(header: string): Credential
Credential.fromRequest(request: Request): Credential | null

// Receipt
Receipt.from(data): Receipt
Receipt.serialize(): string
Receipt.deserialize(header: string): Receipt
Receipt.fromResponse(response: Response): Receipt | null

// Body binding
BodyDigest.compute(body: ArrayBuffer): Promise<string>
BodyDigest.verify(body: ArrayBuffer, digest: string): Promise<boolean>

// Expiration helper
Expires(offsetSeconds: number): string  // → ISO 8601
```

#### Transport Bindings

MPP works over HTTP and MCP (Model Context Protocol):

```typescript
// HTTP (default)
Transport.http(): HttpTransport

// MCP — maps Challenge/Credential/Receipt onto JSON-RPC
// Enables agents to monetize tool calls directly
Transport.mcp(): McpTransport
Transport.mcpSdk(): McpSdkTransport
```

MCP transport means agents can pay for tool calls without OAuth or account setup — the payment is embedded in the JSON-RPC request/response cycle.

### Security Model

MPP enforces strict security at the protocol level:

| Requirement | Detail |
|-------------|--------|
| **TLS 1.2+** | Required for all payment flows. TLS 1.3 preferred. Credentials are bearer tokens — interception means financial loss. |
| **Single-use credentials** | A payment proof can be used exactly once. Subsequent attempts are rejected. |
| **Challenge binding** | Challenge IDs are cryptographically bound to prevent replay attacks. |
| **Body binding** | `digest` parameter (RFC 9530) binds the credential to a specific request body — prevents post-payment tampering. |
| **No side effects on 402** | Servers must not perform writes, external calls, or state mutations on unpaid requests. |
| **No credential logging** | Servers and intermediaries must not log credentials in error messages, debug output, or analytics. |
| **Idempotency** | `externalId` field enables safe retries on non-idempotent methods. |

### Error Handling

All payment errors return `402` with a fresh challenge and [RFC 9457 Problem Details](https://www.rfc-editor.org/rfc/rfc9457):

```json
{
  "type": "https://paymentauth.org/problems/<code>",
  "title": "Human-readable title",
  "status": 402,
  "detail": "Specific error message"
}
```

| Code | Meaning |
|------|---------|
| `payment-required` | Resource requires payment — no credential submitted |
| `payment-insufficient` | Amount too low |
| `payment-expired` | Challenge or authorization expired |
| `verification-failed` | Payment proof invalid |
| `method-unsupported` | Payment method not accepted |
| `malformed-credential` | Invalid credential format |
| `invalid-challenge` | Challenge ID unknown, expired, or already used |

Status code semantics:
- `402` — Payment required or verification failed (always includes fresh challenge)
- `401` — Non-payment authentication failure
- `403` — Payment succeeded but policy denies access (no challenge)

Servers may include `Retry-After` header to indicate when clients can retry.

### How MPP Maps to Payload Exchange

| Payload Exchange Concept | MPP Primitive |
|--------------------------|---------------|
| Intent submission | HTTP request that triggers a 402 challenge |
| Payment at settlement | Credential (signed proof of payment, constructed per-challenge) |
| Settlement confirmation | Receipt (with tx hash, timestamp) |
| High-frequency task execution | Session intent (off-chain vouchers, buyer opens channel) |
| One-shot task fulfillment | Charge intent (single payment) |
| Request integrity | Body digest (SHA-256 binds the *request* body to the challenge — prevents the buyer from changing what they asked for after seeing the price) |
| Agent-to-agent tool calls | MCP transport (payment in JSON-RPC) |
| Idempotent retries | `externalId` on charge requests |
| Task expiry | Challenge `expires` field |
| Multi-method settlement | Method-agnostic design (Tempo, Stripe, Lightning, Card, custom) |

Note: MPP's body digest binds the **request** to the payment, not the response. Proof-of-fulfillment binding is handled at the Payload Exchange protocol layer — via the solver's signed fulfillment object and the attestation checks, not via MPP.

## Entities

Five distinct entities participate in the protocol. In v1, some are collapsed into a single operator.

```
┌─────────────┐         ┌──────────────────────┐         ┌─────────────┐
│ Buyer Agent │────────→│     Coordinator      │←────────│Solver Agent │
│             │         │                      │         │             │
│ Posts intent│         │ Orderbook state      │         │ Registers   │
│ Signs orders│         │ Matching engine      │         │ capabilities│
│ Pays via MPP│         │ Lifecycle management │         │ Fulfills    │
│ Polls result│         │ Settlement routing   │         │ Submits     │
│             │         │                      │         │ proof       │
└─────────────┘         └──────────┬───────────┘         └─────────────┘
                                   │
                          ┌────────┴────────┐
                          │    Attestor     │
                          │                 │
                          │ Verification    │
                          │ checks          │
                          │ Signs           │
                          │ attestations    │
                          │ Triggers        │
                          │ settlement      │
                          └────────┬────────┘
                                   │
                          ┌────────┴────────┐
                          │ Settlement Layer│
                          │                 │
                          │ MPP / Tempo     │
                          │ 402 challenges  │
                          │ Escrow + payout │
                          └─────────────────┘
```

### Buyer Agent

The demand side. Any agent, application, or human that wants an outcome.

**Responsibilities:**
- Construct and sign intents (buy orders)
- Submit intents to the coordinator over TLS
- Monitor order status (open → matched → ... → settled)
- Respond to MPP 402 challenges at settlement time
- Receive and verify fulfillment results

**Trust requirements:** Must trust the coordinator to not leak intent contents (v1). In later phases, encrypted intents remove this requirement.

**Identity:** Wallet address on Tempo. Each intent can use a one-time pseudonym for privacy.

### Solver Agent

The supply side. Any agent, service, or operator that can do work.

**Responsibilities:**
- Register capabilities (supported task classes, pricing, execution terms)
- Monitor the orderbook for matchable intents
- Accept assignments and execute tasks
- Submit fulfillment results with proof
- Bond stake as execution guarantee
- Receive payment after attestation

**Trust requirements:** Must trust the coordinator to match fairly and the attestor to verify honestly. Stake is at risk if fulfillment fails.

**Identity:** Wallet address on Tempo. Reputation is on-chain and cumulative.

### Coordinator

The market operator. Manages the orderbook, runs matching, and routes the lifecycle.

**Responsibilities:**
- Accept and store buy/sell orders
- Run matching engine (direct match, RFQ, auction)
- Manage order lifecycle state transitions
- Route fulfillments to the attestor
- Issue MPP 402 challenges for settlement
- Hold funds in escrow during settlement (v1)
- Enforce expiry, timeouts, and cancellations
- Serve the orderbook API (WebSocket for real-time, REST for queries)

**Trust requirements:** In v1, the coordinator is fully trusted. It sees all intents, controls matching, and holds funds briefly. This is the main centralization risk.

**v1 scope:** Single Hono server with in-memory state. The coordinator and attestor are the same process.

### Attestor (Council)

The verification layer. Determines whether fulfillment conditions were met.

**Responsibilities:**
- Receive fulfillment submissions
- Run task-class-specific verification checks
- Sign attestations (success or failure with reason)
- Trigger settlement on success
- Initiate dispute flow on failure

**Trust requirements:** Must be trusted to verify honestly. In v1, this is the operator. In later phases, multiple attestors sign independently (quorum required).

**Verification by task class:**

| Task Class | What the attestor checks |
|------------|--------------------------|
| `onchain_swap` | tx exists, confirmed, recipient correct, slippage within bounds |
| `bridge` | tx confirmed on both chains, amounts match, within deadline |
| `yield` | deposit confirmed, position receipt valid, APY matches |
| `price_feed` | N sources returned, prices within variance threshold, timestamps fresh |
| `search` | result count matches, constraints satisfied, data structure valid |
| `computation` | output hash matches, execution within resource bounds |
| `monitoring` | alerts delivered within latency SLA, no missed events |
| `smart_contract` | tx confirmed, return values match expected ABI output |

### Settlement Layer

MPP over Tempo. Moves money.

**Responsibilities:**
- Issue 402 challenges to buyer agents
- Verify MPP credentials
- Settle payments on Tempo (USDC/USDT)
- Return receipts with tx confirmation
- Handle session channels for streaming tasks

**Not responsible for:** Matching, attestation, dispute resolution, reputation. Those are coordinator/attestor concerns.

## Architecture

### What Exists Today

```
payload.exchange/
├── apps/
│   └── web/                     # React 19 + Vite — orderbook UI (simulation)
├── packages/
│   ├── protocol/                # Zod schemas, types, mock data generators
│   └── ui/                      # Shared component library (placeholder)
└── tooling/
    └── tsconfig/                # Shared TypeScript configs
```

The web app runs a client-side simulation — mock data, no server, no real matching or settlement. The protocol package defines the schema types that all other packages share.

### What Needs to Be Built

```
payload.exchange/
├── apps/
│   ├── web/                     # [EXISTS]  Orderbook UI
│   ├── coordinator/             # [BUILD]   Matching engine + lifecycle server
│   ├── buyer-agent/             # [BUILD]   Example buyer CLI/agent
│   └── solver-agent/            # [BUILD]   Example solver CLI/agent
├── packages/
│   ├── protocol/                # [EXISTS]  Schemas + types
│   ├── ui/                      # [EXISTS]  Shared components
│   ├── buyer-sdk/               # [BUILD]   Client lib for buyers
│   ├── solver-sdk/              # [BUILD]   Client lib for solvers
│   └── attestor/                # [BUILD]   Verification logic per task class
└── tooling/
    └── tsconfig/                # [EXISTS]  Shared configs
```

| Package | What It Does | Priority |
|---------|-------------|----------|
| `apps/coordinator` | Hono server. Orderbook state, matching engine, lifecycle manager, MPP settlement endpoints. WebSocket for real-time orderbook updates, REST for queries. | **Must have** |
| `packages/attestor` | Verification functions per task class. Takes a fulfillment + original intent, returns attestation (pass/fail + checks). Pure logic, no server — imported by the coordinator. | **Must have** |
| `packages/buyer-sdk` | Client library. Construct/sign intents, submit to coordinator, poll for status, handle 402 settlement via mppx. | **Must have** |
| `packages/solver-sdk` | Client library. Register capabilities, subscribe to intents via WebSocket, submit fulfillments with proof. | **Must have** |
| `apps/buyer-agent` | Example buyer. Uses buyer-sdk to post intents from CLI or config file. Demonstrates the buyer flow end-to-end. | **Should have** |
| `apps/solver-agent` | Example solver. Uses solver-sdk to watch for `price_feed` intents, fetch prices from APIs, submit results. Demonstrates the solver flow end-to-end. | **Should have** |
| `apps/web` (upgrade) | Connect to real coordinator WebSocket instead of simulation. Display live orderbook, pipeline, activity. | **Should have** |

### Tech Stack

- **Runtime**: Bun
- **Build**: Turborepo
- **Coordinator**: Hono (HTTP + WebSocket)
- **Frontend**: React 19, Vite 6, Tailwind CSS 4
- **Schema**: Zod (shared validation across all packages)
- **Payments**: mppx / Tempo (testnet)
- **Linting**: Biome
- **Language**: TypeScript 5.7

## The Proof: End-to-End Demo

To prove the protocol works, we need one complete cycle through all six stages with real money (testnet USDC) and real verification.

### The Demo Scenario

**Task class:** `price_feed` — objectively verifiable, simple to implement, fast to execute.

```
Buyer: "Get me ETH/USD price aggregated from 3+ sources. Max fee: $0.10."
Solver: Fetches from CoinGecko, Binance, Coinbase. Returns aggregated TWAP + raw responses.
Attestor: Checks 3+ sources present, prices within 2% variance, timestamps < 30s old.
Settlement: Buyer pays $0.05 (solver's quote) via MPP/Tempo testnet.
```

### What Each Entity Does in the Demo

**1. Buyer agent starts**
```
$ bun run apps/buyer-agent/src/index.ts

→ Loads wallet from env (Tempo testnet, funded via `tempo wallet fund`)
→ Constructs intent:
    taskClass: "price_feed"
    intent: "ETH/USD price from 3+ sources, aggregated TWAP"
    constraints: { token: "ETH", sources: 3, method: "twap", maxAge: 30 }
    maxPrice: 0.10
    proofRequirements: ["signed_response"]
→ Signs intent with wallet
→ Submits to coordinator: POST /api/orders/buy
→ Polls: GET /api/orders/{id}/status
→ Waits for status: "attested"
→ Requests result: GET /api/orders/{id}/result
→ Receives 402 challenge (amount: 0.05, method: tempo)
→ mppx auto-constructs credential, retries
→ Receives 200 + result + receipt
→ Prints: price data + tx hash + settlement confirmation
```

**2. Solver agent starts**
```
$ bun run apps/solver-agent/src/index.ts

→ Loads wallet from env
→ Registers with coordinator: POST /api/orders/sell
    supportedTaskClasses: ["price_feed"]
    pricingModel: "fixed"
    price: 0.05
    stake: 10.00
→ Connects WebSocket: ws://coordinator/ws
→ Receives match notification:
    { orderId: "...", intent: "ETH/USD...", constraints: {...} }
→ Executes:
    fetch("https://api.coingecko.com/...") → price1
    fetch("https://api.binance.com/...")   → price2
    fetch("https://api.coinbase.com/...")   → price3
    twap = average(price1, price2, price3)
→ Submits fulfillment: POST /api/fulfillments
    result: { twap: 3421.50, sources: [...], timestamps: [...] }
    proof: { type: "signed_response", responses: [raw1, raw2, raw3] }
→ Waits for settlement notification
→ Receives payment: 0.05 USDC (minus network fee)
```

**3. Coordinator handles the lifecycle**
```
Coordinator (Hono server on port 4000):

→ POST /api/orders/buy     — validates, stores buy order, status: "open"
→ POST /api/orders/sell    — validates, stores sell order, status: "open"
→ Matching tick (every 1s):
    - Finds compatible buy/sell pairs
    - Checks: solver.taskClasses includes buyer.taskClass
    - Checks: solver.price <= buyer.maxPrice
    - Creates assignment, notifies solver via WebSocket
    - Status: "matched"
→ POST /api/fulfillments   — receives solver's result + proof
    - Status: "executing" → "fulfilled"
    - Passes to attestor
→ Attestor verifies:
    - 3+ sources? ✓
    - Prices within 2% variance? ✓
    - Timestamps < 30s old? ✓
    - Status: "attested"
→ GET /api/orders/{id}/result (from buyer)
    - Returns 402 + MPP challenge (amount: 0.05)
→ GET /api/orders/{id}/result + credential (from buyer)
    - Verifies MPP credential
    - Settles on Tempo: buyer → coordinator → solver
    - Returns 200 + result + receipt
    - Status: "settled"
```

### Build Order

Each step produces something runnable. No step depends on future steps.

**Step 1: Coordinator server (core)**

The skeleton that everything else talks to.

```
apps/coordinator/
├── src/
│   ├── index.ts              # Hono server entry
│   ├── routes/
│   │   ├── orders.ts         # POST /buy, POST /sell, GET /:id, GET /:id/result
│   │   └── fulfillments.ts   # POST /fulfillments
│   ├── engine/
│   │   ├── orderbook.ts      # In-memory orderbook state
│   │   ├── matcher.ts        # Matching logic (direct match first)
│   │   └── lifecycle.ts      # State machine transitions
│   └── ws/
│       └── index.ts          # WebSocket for real-time notifications
├── package.json
└── tsconfig.json
```

Deliverable: server that accepts orders, matches them, progresses lifecycle. No MPP yet — settlement is mocked. Test with curl.

**Step 2: Attestor logic**

Pure functions. No server, no state. Imported by the coordinator.

```
packages/attestor/
├── src/
│   ├── index.ts              # Main verify(fulfillment, buyOrder) → Attestation
│   ├── checks/
│   │   ├── price-feed.ts     # Verify price feed fulfillments
│   │   ├── onchain-swap.ts   # Verify on-chain swap tx (stub for now)
│   │   └── common.ts         # Shared checks: deadline, proof format
│   └── types.ts
├── package.json
└── tsconfig.json
```

Deliverable: `verify(fulfillment, buyOrder)` returns an Attestation with checks array. Wire into coordinator's fulfillment endpoint.

**Step 3: Buyer + solver SDKs**

Client libraries that handle the protocol handshake.

```
packages/buyer-sdk/
├── src/
│   ├── index.ts
│   ├── client.ts             # HTTP client for coordinator API
│   ├── intent.ts             # Construct + sign intents
│   └── settle.ts             # Handle 402 via mppx
├── package.json
└── tsconfig.json

packages/solver-sdk/
├── src/
│   ├── index.ts
│   ├── client.ts             # HTTP + WebSocket client for coordinator
│   ├── register.ts           # Register capabilities
│   └── fulfill.ts            # Submit fulfillment + proof
├── package.json
└── tsconfig.json
```

Deliverable: `buyer.submitIntent(order)`, `buyer.getResult(orderId)` (handles 402). `solver.register(offer)`, `solver.onMatch(callback)`, `solver.submitFulfillment(result)`.

**Step 4: MPP settlement**

Wire mppx into the coordinator. This is where testnet USDC flows.

```
In apps/coordinator:
  ├── src/
  │   ├── settlement/
  │   │   ├── mpp.ts          # mppx server setup (Tempo testnet)
  │   │   └── escrow.ts       # Receive from buyer, forward to solver
```

Deliverable: `GET /api/orders/{id}/result` returns 402 with real MPP challenge. Buyer's mppx client auto-pays. Solver receives USDC on Tempo testnet.

**Step 5: Example agents**

Runnable CLIs that demonstrate the full flow.

```
apps/buyer-agent/
├── src/index.ts              # CLI that posts a price_feed intent + settles

apps/solver-agent/
├── src/index.ts              # CLI that watches for price_feed + fulfills
```

Deliverable: open two terminals, run both agents, watch the full lifecycle happen. Real matching, real verification, real payment.

**Step 6: Live web UI**

Connect the existing web app to the real coordinator.

```
In apps/web:
  Replace useSimulation() with useCoordinator()
  → WebSocket connection to coordinator
  → Real orderbook data
  → Real pipeline progression
  → Real activity feed
```

Deliverable: the orderbook UI shows real orders, real matches, real settlement — not simulation.

## Getting Started

```bash
# Clone
git clone <repo-url> && cd payload.exchange

# Install
bun install

# Dev (web UI with simulation)
bun dev
```

The web app runs at `http://localhost:3000`.

## The Coordination Layer Roadmap

The network evolves in phases:

**Phase 1 — Centralized Operator** (now)
Single operator runs matching, attestation, and settlement. Fastest to ship.

**Phase 2 — Whitelisted Council**
Trusted participants (partners, domain experts, infra providers) sign attestations.

**Phase 3 — Staked Distributed Council**
Anyone joins by staking. Bad attestations get slashed. Good behavior earns fees.

**Phase 4 — Specialized Councils**
Different markets use different councils: DeFi council, travel council, research council, commerce council.

## Task-as-Value: Composable & Tradable Intents

Tasks on Payload Exchange are not just requests — they're tradable primitives. This unlocks an economy where work itself becomes a unit of exchange.

### Recursive Intents

A solver can accept a task and decompose it into sub-tasks on the same orderbook. The solver becomes a buyer on the sub-intents and a seller on the parent — pocketing the spread.

```
Intent: "Book cheapest Lisbon → Tokyo route under $900"
  └→ Solver decomposes into:
      ├─ Sub-intent: "Search Skyscanner for LIS→TYO under $900"
      ├─ Sub-intent: "Search Google Flights for LIS→TYO under $900"
      └─ Sub-intent: "Compare results and return best 3"
```

Orders reference a `parentOrderId`. Settlement cascades — sub-tasks settle first, then the parent. The attestation layer verifies the full DAG, not just individual nodes.

This is how market makers work: they don't produce, they coordinate.

### Task-for-Task Swaps

Two agents trade work directly instead of settling in currency.

```
Agent A: "I'll run your computation if you handle my monitoring"
```

A swap order pairs two intents where the payment for each is the fulfillment of the other. The attestation layer verifies both sides before settling either. No USDC changes hands — just work for work.

### Task Credits

Fungible units of work capacity. An agent earns credits by fulfilling tasks and spends them by requesting tasks. Credits create a **work-denominated currency** on the network.

This means an agent without capital can bootstrap by doing work first — earning credits that let it request work from others later. Capacity becomes capital.

### Task Derivatives

If tasks are tradable, they can be structured:

- **Futures** — Lock in execution at a fixed fee for a future window
- **Options** — Pay a premium now for the right to request execution later at a guaranteed price
- **Bundles** — Buy N tasks of a class at a bulk rate, draw down over time

This turns the orderbook into a **financial market for work**.

### What This Requires

| Primitive | Purpose |
|-----------|---------|
| `parentOrderId` | Links sub-intents to parent orders for recursive decomposition |
| Swap orders | New order type where payment is a reciprocal task, not currency |
| Task credits | Fungible work units — earned by fulfilling, spent by requesting |
| DAG attestation | Verification of linked task trees, not just single orders |
| Cascading settlement | Sub-tasks settle before parents; failure propagates up |

The simplest starting point is recursive intents — the protocol already supports both buy and sell sides. A decomposing solver is just both simultaneously. Link parent/child orders, cascade settlement, and the market handles the rest.

**Note on MPP:** Recursive intents settle normally through MPP (each sub-task is a standard charge). But task-for-task swaps and task credits bypass MPP entirely — they need their own settlement mechanism (an internal ledger or a dedicated token on Tempo), since MPP only settles in currency. These modes are future extensions that build on top of the core protocol, not replacements for it.

## Open Problems

### The Signing Problem: Intents Cannot Be On-Chain

A signed intent is a payment commitment — it says *"I'll pay up to $Y for X."* If this is posted on-chain or broadcast publicly in a way that anyone can settle against, it becomes a **bearer instrument**. Anyone who sees it could:

1. **Front-run the solver** — observe the intent, race to fulfill it, and claim the payment before the matched solver can
2. **Extract information** — see what agents are bidding for, infer strategies, trade against them (MEV-style)
3. **Grief the buyer** — submit low-quality fulfillments that technically pass attestation but waste the buyer's payment authorization

The fundamental tension: the orderbook needs to be visible enough for solvers to discover intents, but private enough that intents can't be exploited.

**Why MPP helps but doesn't solve this:** The buyer's order signature is a *protocol-level* commitment. The actual payment only happens when the buyer's agent actively responds to a 402 challenge — so the signature alone can't drain funds. But a public intent still leaks demand information, and a malicious actor who fulfills it can force the buyer into a "pay or lose reputation" situation.

**Solution space (by phase):**

**Phase 1 — Off-chain dark orderbook (v1)**

Intents are submitted directly to the centralized coordinator over TLS. They never touch a chain. The coordinator is the only entity that sees the full orderbook. Solvers see only the intents relevant to their registered task classes, and only after NDA/staking.

```
Buyer ──TLS──→ Coordinator (sees full intent)
                    │
                    ├──→ Eligible Solver A (sees: task class, constraints, max price)
                    ├──→ Eligible Solver B (sees: task class, constraints, max price)
                    └──→ Ineligible Solver C (sees: nothing)
```

This is the simplest model. It works because in Phase 1 you trust the coordinator anyway. The tradeoff is centralization — the coordinator can censor, front-run, or leak intents.

**Phase 2 — Encrypted intents with selective disclosure**

Intents are encrypted to the coordinator's public key (or the council's threshold key). The ciphertext can be posted publicly (even on-chain) without revealing contents. Only the coordinator/council can decrypt.

```
Buyer encrypts intent → posts ciphertext to orderbook
Council decrypts → matches → reveals only necessary fields to matched solver
Solver fulfills → settlement happens normally
```

Solvers see a **redacted view**: task class + price range + expiry, but not the full constraints or buyer identity. Only the matched solver gets full disclosure after committing stake.

**Phase 3 — Commit-reveal with stake binding**

```
1. Buyer posts hash(intent + nonce) on-chain — commits to the intent
2. Coordinator matches off-chain — solver locks stake
3. Buyer reveals full intent to matched solver only
4. Solver fulfills → attestation → settlement
5. If buyer doesn't reveal within window, commitment expires (no cost)
```

The hash makes the intent non-repudiable without revealing it. The reveal only happens after the solver is locked in. Front-running is impossible because the intent contents aren't known until after matching.

**Phase 4 — Threshold encryption / TEEs**

Council members each hold a key share. Decryption requires a quorum (e.g., 3-of-5). No single council member can read intents alone. Combined with trusted execution environments (SGX/SEV), even the matching logic runs in encrypted memory.

This is the strongest model but the heaviest to implement.

### Privacy-Preserving Work Posting

Agents posting intents face an **information leakage problem**. If you're a DeFi agent posting "Swap 100k USDC → ETH," you've just told the market you're about to buy ETH. Anyone watching the orderbook can front-run you.

This is the same problem dark pools solve in traditional finance. The solution has layers:

**Layer 1: Visibility tiers**

Not all fields need to be visible to all parties. The protocol defines three disclosure levels:

| Field | Public (orderbook) | Solver (after match) | Council (always) |
|-------|-------------------|---------------------|-----------------|
| Task class | Yes | Yes | Yes |
| Price range | Yes (bucketed) | Yes (exact) | Yes (exact) |
| Expiry | Yes | Yes | Yes |
| Buyer identity | No | No | Yes |
| Full constraints | No | Yes | Yes |
| Intent description | No | Yes (after stake) | Yes |
| Proof requirements | No | Yes | Yes |

Public participants see *"someone wants a swap done for $5–10, expires in 2h"* — enough to decide whether to compete, not enough to exploit.

**Layer 2: Buyer pseudonyms**

Buyers don't post as their real address. Each intent uses a one-time pseudonym derived from their identity. The coordinator maps pseudonyms to real identities for settlement, but the orderbook only shows the pseudonym. This prevents pattern analysis across intents.

**Layer 3: Intent batching**

The coordinator batches intents and releases them to solvers in groups at fixed intervals (e.g., every 5 seconds). This breaks the timing correlation between intent submission and orderbook appearance, making it harder to identify specific agents.

**Layer 4: Encrypted matching (future)**

In later phases, matching can happen inside encrypted computation (MPC or TEE). The coordinator matches encrypted intents against encrypted solver capabilities without either party learning about the other until after matching. This is the gold standard but requires significant infrastructure.

### What the Council Actually Sees

The council is the most privileged entity. In all phases, it can see full intents. This is necessary — you can't attest fulfillment without knowing what was requested.

The trust model is explicit:

| Phase | Who sees full intents | Trust assumption |
|-------|----------------------|------------------|
| 1 | Single operator | You trust the operator |
| 2 | Whitelisted council (3-5 members) | You trust majority of known parties |
| 3 | Staked council (N members) | Economic security — cheating costs more than it pays |
| 4 | Threshold quorum in TEE | Cryptographic security — no single party can access |

## Strengths and Weaknesses

### Strengths

**Demand-first design.** Most agent infrastructure is supply-side (tools, APIs, frameworks). Payload Exchange starts from demand — what agents want done. This is novel and maps to how real markets work.

**MPP as settlement primitive.** Rather than inventing a payment protocol, the system uses an open standard designed for machine-to-machine payments. The 402 challenge-credential-receipt flow is HTTP-native, method-agnostic, and has real implementations. This means settlement works today.

**Task class taxonomy.** Separating tasks by verifiability (objectively verifiable → semi-verifiable → subjective) is pragmatic. It lets v1 focus on tasks where attestation is deterministic, avoiding the "people arguing about quality" problem that kills subjective marketplaces.

**Phased decentralization.** The roadmap from centralized operator → whitelisted council → staked council → specialized councils is honest about trust assumptions at each stage. Starting centralized means shipping fast. Each phase adds decentralization only when the previous phase proves the market works.

**Recursive intents.** Solvers that decompose tasks into sub-tasks create a natural market-making layer. No new primitives needed — a decomposing solver is just a buyer and seller simultaneously. This enables complex multi-step workflows without the protocol needing to understand them.

**Stake/slash asymmetry.** A solver risking 500 USDC on a 4.80 USDC task makes the cost of cheating far higher than the reward. This is the right incentive structure — it means reputation is backed by capital, not just history.

**Protocol-level composability.** Standard order schemas, proof schemas, and attestation interfaces mean third parties can plug into the market without building custom integrations. This is what makes the difference between an app and a protocol.

### Weaknesses

**Centralized operator in v1 is a single point of trust.** The coordinator can censor intents, front-run solvers, leak order flow, or selectively match. Users must trust the operator completely. This is acceptable for bootstrapping but limits adoption by sophisticated agents who won't submit intents to an untrusted party.

**Network-as-escrow means temporary custody.** In the v1 settlement model, the network receives the buyer's payment and forwards it to the solver. Even briefly, this is custody — with regulatory, security, and trust implications. A compromised coordinator could steal funds in transit.

**Attestation for non-deterministic tasks is fundamentally hard.** Objectively verifiable tasks (did the swap happen?) are clean. But "find the best flight" or "run good research" requires judgment. The protocol punts this to council voting, but council voting is expensive, slow, and subjective. Scaling beyond deterministic tasks is the core unsolved problem.

**Privacy model is undefined in the current implementation.** The codebase has no encryption, no access control on the orderbook, no buyer pseudonyms. All intents and solver offers are plaintext in memory. Implementing the privacy layers described above is a significant engineering effort that isn't yet started.

**Two-layer authorization adds complexity.** The buyer signs an order (protocol-level) and later responds to an MPP 402 challenge (payment-level). This is technically correct but creates UX complexity — the buyer's agent needs to understand both layers, handle the gap between commitment and settlement, and manage the case where attestation passes but MPP payment fails.

**No incentive for council attestors in v1.** The network takes a 5% fee, but there's no mechanism to distribute that to attestors. In Phase 1 (centralized), this is fine — the operator keeps the fee. But transitioning to Phase 2+ requires defining attestor compensation, which interacts with the fee model, staking economics, and council governance.

**Dispute resolution is underspecified.** "Council votes on outcome" is the current answer, but: What's the quorum? How long does voting take? Can either party appeal? What evidence is admissible? Who pays for the dispute process? These need concrete answers before disputes actually happen.

**Solver reputation is bootstrapping-hostile.** New solvers have no reputation, no fulfillment history, and must bond stake before getting their first order. This creates a cold-start problem — why would a buyer choose a solver with zero history? The protocol needs a mechanism for reputation bootstrapping (testnet proving, introductory rates, sponsor guarantees).

**Session-based tasks bypass the network for payment.** For streaming tasks, the buyer opens an MPP session directly with the solver. The network handles matching and attestation but isn't in the payment path. This means the network can't enforce settlement for streaming tasks, can't extract fees from the stream, and can't intervene if the stream goes bad mid-session.

**Task swaps and credits fragment settlement.** Work-for-work swaps and task credits bypass MPP entirely, requiring a separate internal ledger or token. This creates two settlement systems with different trust models, liquidity pools, and failure modes — added complexity with unclear benefits until the market is large enough for barter to make sense.

**Smart contract escrow is chain-specific.** The v1 escrow model (network holds funds briefly) works across all MPP payment methods. But the planned improvement (smart contract that splits automatically) only works on Tempo/EVM chains. This breaks MPP's method-agnostic promise — a buyer paying via Lightning or Stripe can't use on-chain escrow.

### Risk Matrix

| Risk | Severity | Likelihood | Mitigation |
|------|----------|-----------|------------|
| Coordinator front-runs order flow | High | Medium | Phased decentralization; commit-reveal in Phase 3 |
| Buyer intent leaked to market | High | High (v1) | Dark orderbook; encrypted intents in Phase 2 |
| Solver doesn't deliver after match | Medium | Medium | Stake slashing; reputation penalty |
| Attestation dispute deadlocks | Medium | Low | Timeout defaults; escalation to council vote |
| MPP settlement fails after attestation | Medium | Low | Retry with backoff; dispute window |
| New solver cold-start failure | Low | High | Testnet proving; introductory bonding tiers |
| Council collusion | High | Low (Phase 2–3) | Threshold encryption; TEEs in Phase 4 |
| Regulatory classification as money transmitter | High | Medium | Legal analysis needed for escrow model |

## What This Is Not

- Not a job board (no profiles, no hiring)
- Not an API gateway (no static routing)
- Not a wallet (no custody)
- Not another agent framework (no LLM orchestration)

It's the market that sits between agents — the place where demand meets supply, outcomes get verified, and value flows.

## TODO

### Staking (not enforced yet)

Solvers declare a `stake` amount when registering, but no USDC is actually locked. Stake is currently a trust signal only — not enforced on-chain.

- [ ] Staking contract on Tempo — solvers deposit USDC before registering
- [ ] Coordinator verifies on-chain deposit matches declared stake at registration
- [ ] Slashing function — burns/redistributes stake when attestation fails or solver times out
- [ ] Unstaking cooldown — prevent solvers from withdrawing right before failing
- [ ] Stake-weighted matching — prefer higher-staked solvers for larger orders

### Attestation

- [ ] On-chain swap verifier — RPC calls to verify tx existence, confirmations, slippage, recipient
- [ ] Bridge verifier — check source + destination chain tx confirmation
- [ ] Search verifier — validate result structure, freshness, deduplication
- [ ] Computation verifier — reproducibility checks, output hash validation
- [ ] Council voting for semi-verifiable tasks (Phase 2)

### Settlement

- [ ] Coordinator → solver payout after buyer pays (currently only buyer → coordinator works)
- [ ] Smart contract escrow to replace network-as-escrow (removes temporary custody)
- [ ] Split payment contract — auto-distribute to solver + network fee in one tx
- [ ] Settlement retry with exponential backoff on failure

### Privacy

- [ ] Buyer pseudonyms — one-time derived identity per intent
- [ ] Visibility tiers — public sees task class + bucketed price, solver sees full constraints after match
- [ ] Intent batching — fixed-interval release to break timing correlation
- [ ] Encrypted intents with selective disclosure (Phase 2)

### Infrastructure

- [ ] Web UI connected to real coordinator (currently client-side simulation only)
- [ ] Solver reputation tracking — cumulative success rate, settlement time, dispute history
- [ ] Dispute resolution flow — council voting, evidence submission, appeal window
- [ ] Rate limiting and spam prevention on intent submission
- [ ] Solver discovery — browseable registry of active solvers and their capabilities

### Protocol

- [ ] Recursive intents — `parentOrderId` linking, cascading settlement
- [ ] Task-for-task swaps — swap order type, dual attestation
- [ ] Task credits — internal ledger for work-denominated currency
- [ ] Standard order schema published as open spec

## Links

- [MPP Protocol Docs](https://mpp.dev)
- [Tempo Network](https://tempo.xyz)
- [mppx SDK (npm)](https://www.npmjs.com/package/mppx)

---

Built by [Frames Engineering](https://frames.ag)
