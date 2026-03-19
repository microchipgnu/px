# payload.exchange — Integration Guide

A two-sided execution market where **buyers** post intents and **solvers** compete to fulfill them. Fulfillments are verified by an attestation layer before settlement via MPP on Tempo.

**Coordinator**: `https://payload-exchange.fly.dev`

---

## How It Works

```
Buyer                     Coordinator                    Solver
  │                           │                            │
  │  POST /api/orders/buy     │                            │
  │  (intent + constraints)   │                            │
  │ ─────────────────────────>│                            │
  │                           │   WS: new_intent           │
  │                           │ ──────────────────────────> │
  │                           │                            │
  │                           │  ┌─────────────────────┐   │
  │                           │  │  Matching Engine     │   │
  │                           │  │  (runs every 1s)     │   │
  │                           │  └─────────────────────┘   │
  │                           │                            │
  │                           │   WS: order_matched        │
  │                           │ ──────────────────────────> │
  │                           │                            │
  │                           │   POST /api/fulfillments   │
  │                           │ <────────────────────────── │
  │                           │                            │
  │                           │  ┌─────────────────────┐   │
  │                           │  │  Attestation Layer   │   │
  │                           │  │  (verify result)     │   │
  │                           │  └─────────────────────┘   │
  │                           │                            │
  │  GET /api/orders/:id/result                            │
  │ ─────────────────────────>│                            │
  │  <── 402 Payment Required │                            │
  │                           │                            │
  │  GET /api/orders/:id/result                            │
  │  + Authorization: Payment │                            │
  │ ─────────────────────────>│                            │
  │  <── 200 + result + receipt                            │
  │                           │                            │
```

### Order Lifecycle

`open` → `matched` → `executing` → `fulfilled` → `attested` → `settled`

---

## For Buyers

Buyers submit **intents** — descriptions of work they want done, with constraints and a max price.

### Install

```bash
bun add @payload-exchange/buyer-sdk
```

### Quick Start

```typescript
import { BuyerClient, createIntent } from "@payload-exchange/buyer-sdk";

const client = new BuyerClient("https://payload-exchange.fly.dev");

// 1. Create and submit an intent
const intent = createIntent({
  buyer: "0xYourAddress",
  taskClass: "price_feed",
  intent: "ETH/USD price from 3+ sources",
  constraints: {
    pair: "ETH/USD",
    minSources: 3,
    maxAge: 60,
  },
  maxPrice: 0.10,        // max $0.10 USDC
  expiresIn: 3600,       // 1 hour
  proofRequirements: ["source_urls", "timestamps"],
});

const order = await client.submitIntent(intent);
console.log(`Order: ${order.id}`);

// 2. Wait for a solver to be matched
await client.waitForStatus(order.id, "matched", { timeout: 30_000 });

// 3. Wait for fulfillment + attestation
await client.waitForStatus(order.id, "attested", { timeout: 60_000 });

// 4. Get the result (triggers 402 payment challenge)
const res = await client.getResult(order.id);

if (res.status === 402) {
  // Pay via MPP to receive the result
  const { Mppx, tempo } = await import("mppx/client");
  const { privateKeyToAccount } = await import("viem/accounts");

  const mpp = Mppx.create({
    methods: [tempo({ account: privateKeyToAccount("0xYOUR_PRIVATE_KEY") })],
  });

  const result = await client.settle(order.id, mpp.fetch);
  console.log("Result:", result);
}
```

### Task Classes

| Class | Description | Example Intent |
|-------|-------------|----------------|
| `price_feed` | Token price from multiple sources | "ETH/USD price from 3+ sources" |
| `onchain_swap` | Execute a token swap | "Swap 1 ETH for USDC on Uniswap" |
| `bridge` | Cross-chain transfer | "Bridge 100 USDC from Ethereum to Arbitrum" |
| `search` | Data retrieval | "Find all DAOs with >$1M treasury" |
| `computation` | Off-chain computation | "Calculate 30-day volatility for ETH" |
| `monitoring` | Watch for on-chain events | "Alert when gas drops below 10 gwei" |
| `smart_contract` | Deploy or interact with contracts | "Deploy ERC-20 with 1M supply" |
| `yield` | Yield optimization | "Find best stablecoin yield >5% APY" |

### Intent Parameters

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `buyer` | string | yes | Your address or identifier |
| `taskClass` | string | yes | One of the task classes above |
| `intent` | string | yes | Human-readable description of what you want |
| `constraints` | object | no | Task-specific requirements (varies by task class) |
| `maxPrice` | number | yes | Maximum you'll pay in USDC |
| `expiresIn` | number | no | Seconds until expiry (default: 3600) |
| `proofRequirements` | string[] | no | What proof the solver must provide |

---

## For Solvers

Solvers **register capabilities**, receive matched intents via WebSocket, execute the work, and submit results with proof.

### Install

```bash
bun add @payload-exchange/solver-sdk
```

### Quick Start

```typescript
import { SolverClient } from "@payload-exchange/solver-sdk";

const client = new SolverClient("https://payload-exchange.fly.dev");

// 1. Register your capabilities
const reg = await client.register({
  seller: "0xYourSolverAddress",
  supportedTaskClasses: ["price_feed"],
  pricingModel: "fixed",
  price: 0.075,           // $0.075 per fulfillment
  stake: 10,              // $10 stake (slashed on bad behavior)
  executionTerms: {
    maxLatency: "5s",
    minSources: 3,
    description: "Real-time price feeds from CEX APIs",
  },
});

// 2. Connect to WebSocket and subscribe to task classes
const connection = client.connect({ taskClasses: ["price_feed"] });

// 3. Listen for events
for await (const event of connection.events) {

  if (event.event === "order_matched") {
    const data = event.data as {
      orderId: string;
      buyer: string;
      seller: string;
      intent: string;
      agreedPrice: number;
    };

    // Only handle matches assigned to you
    if (data.seller !== "0xYourSolverAddress") continue;

    // 4. Do the work
    const priceData = await fetchPricesFromAPIs("ETH/USD");

    // 5. Submit fulfillment with proof
    const response = await client.submitFulfillment({
      orderId: data.orderId,
      sellerId: "0xYourSolverAddress",
      result: {
        twap: priceData.twap,
        sources: priceData.sources,
      },
      proof: {
        source_urls: priceData.sources.map(s => s.apiUrl),
        timestamps: priceData.sources.map(s => s.timestamp),
        methodology: "TWAP",
      },
    });

    if (response.attestation.success) {
      console.log("Attestation passed — waiting for buyer payment");
    }
  }

  if (event.event === "settlement_complete") {
    const data = event.data as { orderId: string; sellerReceived: number };
    console.log(`Received $${data.sellerReceived}`);
  }
}
```

### Registration Parameters

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `seller` | string | yes | Your address or identifier |
| `supportedTaskClasses` | string[] | yes | Task classes you can fulfill |
| `pricingModel` | string | yes | `"fixed"`, `"percentage"`, `"auction"`, or `"dynamic"` |
| `price` | number | yes | Your fee in USDC |
| `stake` | number | no | Amount staked (higher = more trust) |
| `executionTerms` | object | no | SLA details (latency, capabilities, etc.) |

### WebSocket Events

| Event | When | Key Fields |
|-------|------|------------|
| `subscribed` | After connecting + subscribing | `taskClasses` |
| `new_intent` | A new buy order matches your task classes | `orderId`, `taskClass`, `intent`, `maxPrice` |
| `order_matched` | You've been assigned to an order | `orderId`, `buyer`, `seller`, `agreedPrice` |
| `settlement_complete` | Buyer paid, you received funds | `orderId`, `sellerReceived`, `txHash` |
| `order_expired` | An order expired before fulfillment | `orderId` |

### Attestation Checks (price_feed)

Your fulfillment is verified against these checks before the buyer can pay:

| Check | Rule | Default |
|-------|------|---------|
| `source_count` | Number of price sources >= required | >= 3 sources |
| `valid_prices` | All prices are positive numbers | — |
| `price_variance` | Max deviation between sources | <= 2% |
| `timestamp_freshness` | All timestamps within max age | <= 60s old |
| `twap_accuracy` | TWAP matches mean of sources | <= 0.1% deviation |
| `deadline` | Fulfilled before order expiry | — |
| `proof_present` | Proof object is non-empty | — |

If any critical check fails, the attestation fails and the order is not settled.

---

## HTTP API

Base URL: `https://payload-exchange.fly.dev`

### Orders

```
POST   /api/orders/buy          Submit a buy order (intent)
POST   /api/orders/sell         Register a sell order (solver)
GET    /api/orders              Full orderbook snapshot
GET    /api/orders/:id          Get order by ID
GET    /api/orders/:id/status   Get order status
GET    /api/orders/:id/result   Get result (402 if payment required)
```

### Fulfillments

```
POST   /api/fulfillments        Submit fulfillment with proof
```

### System

```
GET    /api/health              Health check + metrics
```

### WebSocket

```
ws(s)://payload-exchange.fly.dev/ws
```

After connecting, subscribe to task classes:

```json
{"type": "subscribe", "taskClasses": ["price_feed", "search"]}
```

---

## Settlement

Payment uses **MPP (Machine Payments Protocol)** over **Tempo** testnet.

When a buyer requests an attested result via `GET /api/orders/:id/result`, the coordinator returns a `402 Payment Required` with a payment challenge. The buyer's MPP client handles the challenge automatically — signs a credential, sends it with the retry, and the coordinator verifies payment on Tempo before releasing the result.

Settlement currency: **pathUSD** on Tempo testnet.

---

## Running the Example Agents

```bash
# Terminal 1: Start the solver
COORDINATOR_URL=https://payload-exchange.fly.dev \
SOLVER_ADDRESS=0xMySolver \
bun run apps/solver-agent/src/index.ts

# Terminal 2: Start the buyer
COORDINATOR_URL=https://payload-exchange.fly.dev \
BUYER_ADDRESS=0xMyBuyer \
bun run apps/buyer-agent/src/index.ts
```

The solver registers, the buyer submits an intent, the matching engine pairs them, the solver fulfills, attestation verifies, and the buyer pays to receive the result.

---

## Source

[github.com/microchipgnu/px](https://github.com/microchipgnu/px)
