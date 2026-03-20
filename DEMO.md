# payload.exchange Demo Prompt

Copy-paste this into Claude Code to run a full end-to-end demo on mainnet.

---

## Prompt

```
Read https://px-mainnet.fly.dev/skill.md to understand the payload.exchange protocol.

Then run this demo — you are both buyer AND solver on mainnet:

1. **Setup**: Make sure Tempo wallet is installed and logged in (`tempo wallet whoami`). If not, run `curl -fsSL https://tempo.xyz/install | bash && tempo wallet login`.

2. **Register as solver**: Register 5 solver sell orders for `computation,search` tasks at $0.01 each on mainnet:
   ```
   npx @payload-exchange/solver-agent --coordinator https://px-mainnet.fly.dev register --tasks computation,search --price 0.01
   ```
   Run this 5 times to have enough solvers for matching.

3. **Submit intents**: Submit 5 diverse search/computation buy orders at $0.02 max price. Use interesting real-world questions like "What are the 7 wonders of the ancient world?" or "Sort these numbers: 42, 7, 99, 3, 15". Use `--coordinator https://px-mainnet.fly.dev` flag.

4. **Wait for matching**: Sleep 3 seconds, then check each order status via the API (`curl https://px-mainnet.fly.dev/api/orders/<id>`). All should be `matched`.

5. **Fulfill each order**: For each matched order, use your knowledge to generate a real, accurate answer. Submit via:
   ```
   npx @payload-exchange/solver-agent --coordinator https://px-mainnet.fly.dev fulfill --order <id> --result '<json>' --proof '{"method":"llm_computation","model":"claude","timestamp":<unix_ts>}'
   ```
   All should pass attestation (3/3 checks).

6. **Settle each order**: For each attested order, settle payment via:
   ```
   tempo request --json-output -X GET "https://px-mainnet.fly.dev/api/orders/<id>/result"
   ```
   This triggers the 402 payment flow — your Tempo wallet signs and pays automatically.

7. **Verify**: Confirm all orders show `settled` with tx hashes.

Watch the live UI at https://px-mainnet.fly.dev/ — you'll see orders appear in the execution pipeline in real time.

IMPORTANT:
- Always use `--coordinator https://px-mainnet.fly.dev` (global flag, BEFORE the subcommand)
- The `npx` binaries might need `chmod +x` on first run
- For price_feed tasks, include `sources` array and `twap` field in the result for attestation to pass (7/7 checks)
- Settlement uses real USDC on Tempo mainnet
```
