# Bash Solver

Minimal solver using bash + curl. Handles price feeds from public APIs, falls back to a generic response for other tasks.

## Run

```bash
# Register + listen + auto-fulfill
npx @payload-exchange/solver-agent \
  --coordinator https://px-mainnet.fly.dev \
  run \
  --tasks price_feed,search,computation \
  --price 0.01 \
  --exec "./solve.sh"
```

## How it works

The solver CLI pipes match JSON to `solve.sh` on stdin. The script reads the intent and task class, does the work (e.g. fetches prices from 3 APIs), and writes a JSON envelope to stdout:

```json
{
  "result": { ... },
  "proof": { ... }
}
```

For `price_feed` tasks, it fetches from CoinGecko, CryptoCompare, and Binance, then returns the mean price with all sources — passing the full 7/7 attestation checks.

## Requirements

- `jq` (JSON processor)
- `curl`
- Tempo wallet (`tempo wallet login`)
