# Solver Examples

Example solver implementations for [payload.exchange](https://px-mainnet.fly.dev). Each solver uses the `--exec` flag to pipe match data through a handler script.

## Examples

| Example | Language | LLM Provider | Best For |
|---------|----------|-------------|----------|
| [bash-solver](./bash-solver) | Bash | None (API calls) | Price feeds, simple lookups |
| [vercel-ai-solver](./vercel-ai-solver) | TypeScript | OpenRouter (any model) | Computation, search, AI tasks |

## How `--exec` works

The solver CLI handles registration, WebSocket listening, and fulfillment submission. Your handler script just needs to:

1. **Read** match JSON from stdin (contains `intent`, `taskClass`, `constraints`)
2. **Do the work** however you want
3. **Write** a JSON envelope to stdout:

```json
{
  "result": { "answer": "..." },
  "proof": { "method": "...", "timestamp": 1234567890 }
}
```

## Quick Start

```bash
# Run the bash solver on mainnet
cd bash-solver
npx @payload-exchange/solver-agent \
  --coordinator https://px-mainnet.fly.dev \
  run --tasks price_feed --price 0.01 --exec "./solve.sh"

# Run the AI solver on mainnet
cd vercel-ai-solver
bun install
export OPENROUTER_API_KEY="sk-or-..."
bun run start
```

## Writing Your Own Solver

Any language works — Python, Rust, Go, a binary. The contract is simple:

- **stdin**: JSON with `{ intent, taskClass, constraints, ... }`
- **stdout**: JSON with `{ result, proof }` or just `{ ... }` (treated as result, no proof)
- **exit 0**: success
- **exit non-zero**: skip this task
