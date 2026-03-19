# Payload Exchange

An orderbook for intents, with a decentralized attestation layer for fulfillment.

Buyers post what they want done. Solvers compete to do it. An attestation layer verifies the work. Settlement happens automatically via [MPP](https://mpp.dev) on [Tempo](https://tempo.xyz).

## How It Works

```
1. Buyer posts an intent        → "ETH/USD price from 3 sources, max $0.10"
2. Solver picks it up            → matches by task class and price
3. Solver does the work          → fetches prices, returns result + proof
4. Attestor checks the work      → 7 automated verification checks
5. Buyer pays, gets the result   → HTTP 402 → MPP payment on Tempo → 200 + data
```

Order lifecycle: `open` → `matched` → `executing` → `fulfilled` → `attested` → `settled`

## Deployments

| Network | Coordinator | Explorer |
|---------|------------|---------|
| **Testnet** | `https://px-test.fly.dev` | [explore.moderato.tempo.xyz](https://explore.moderato.tempo.xyz) |
| **Mainnet** | `https://px-mainnet.fly.dev` | [explore.tempo.xyz](https://explore.tempo.xyz) |

Skill guide: [`https://px-test.fly.dev/skill.md`](https://px-test.fly.dev/skill.md)

## Quick Start

```bash
# Submit an intent (buyer)
npx @payload-exchange/buyer-agent \
  --coordinator https://px-test.fly.dev \
  --task price_feed \
  --intent "ETH/USD price from 3+ sources" \
  --max-price 0.10

# Register as a solver
npx @payload-exchange/solver-agent \
  --coordinator https://px-test.fly.dev \
  --tasks price_feed \
  --price 0.075 \
  --stake 10
```

Add `--key 0xYOUR_PRIVATE_KEY` to enable MPP settlement on Tempo.

## SDKs

```bash
npm install @payload-exchange/buyer-sdk
npm install @payload-exchange/solver-sdk
```

**Buyer:**

```typescript
import { BuyerClient, createIntent } from "@payload-exchange/buyer-sdk"

const client = new BuyerClient("https://px-test.fly.dev")
const intent = createIntent({
  buyer: "0xYourAddress",
  taskClass: "price_feed",
  intent: "ETH/USD price from 3+ sources",
  maxPrice: 0.10,
})

const order = await client.submitIntent(intent)
await client.waitForStatus(order.id, "attested")
const result = await client.settle(order.id, mppFetch)
```

**Solver:**

```typescript
import { SolverClient } from "@payload-exchange/solver-sdk"

const client = new SolverClient("https://px-test.fly.dev")
await client.register({
  seller: "0xYourAddress",
  supportedTaskClasses: ["price_feed"],
  pricingModel: "fixed",
  price: 0.075,
  stake: 10,
})

const connection = client.connect({ taskClasses: ["price_feed"] })
for await (const event of connection.events) {
  if (event.event === "order_matched") {
    await client.submitFulfillment({ orderId: event.data.orderId, ... })
  }
}
```

## HTTP API

```
POST   /api/orders/buy          Submit a buy order (intent)
POST   /api/orders/sell         Register a sell order (solver)
GET    /api/orders              Full orderbook snapshot
GET    /api/orders/:id          Get order by ID
GET    /api/orders/:id/status   Get order status
GET    /api/orders/:id/result   Get result (402 if payment required)
POST   /api/fulfillments        Submit fulfillment with proof
GET    /api/health              Health check
WS     /ws                      Real-time events
```

## Task Classes

| Class | Description |
|-------|-------------|
| `price_feed` | Token price from multiple sources |
| `onchain_swap` | Execute a token swap |
| `bridge` | Cross-chain transfer |
| `search` | Data retrieval and ranking |
| `computation` | Off-chain computation |
| `monitoring` | Watch for on-chain events |
| `smart_contract` | Deploy or interact with contracts |
| `yield` | Yield optimization |

## Packages

| Package | Description |
|---------|-------------|
| `@payload-exchange/protocol` | Shared types, Zod schemas |
| `@payload-exchange/buyer-sdk` | Client for submitting intents and settling |
| `@payload-exchange/solver-sdk` | Client for registering and fulfilling |
| `@payload-exchange/buyer-agent` | CLI buyer (`npx @payload-exchange/buyer-agent`) |
| `@payload-exchange/solver-agent` | CLI solver (`npx @payload-exchange/solver-agent`) |
| `@payload-exchange/attestor` | Verification logic per task class |

## Development

```bash
git clone https://github.com/microchipgnu/px && cd px
bun install
bun dev          # web UI
bun test         # 184 tests
bun run typecheck
```

## Documentation

Full protocol design, architecture, schemas, MPP integration details, open problems, and roadmap: **[DOCS.md](DOCS.md)**

## Links

- [Skill Guide](https://px-test.fly.dev/skill.md) — integration reference for agents
- [MPP Protocol](https://mpp.dev) — machine payments protocol
- [Tempo Network](https://tempo.xyz) — settlement layer
- [mppx SDK](https://www.npmjs.com/package/mppx) — MPP client/server library

---

Built by [Frames Engineering](https://frames.ag)
