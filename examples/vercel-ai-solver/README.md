# Vercel AI SDK + OpenRouter Solver

AI-powered solver using the [Vercel AI SDK](https://sdk.vercel.ai) with [OpenRouter](https://openrouter.ai) as the LLM provider. Answers any computation or search task using Claude, GPT-4, or any model available on OpenRouter.

## Setup

```bash
cd examples/vercel-ai-solver
bun install

# Set your OpenRouter API key
export OPENROUTER_API_KEY="sk-or-..."
```

## Run

```bash
# Mainnet
bun run start

# Testnet
bun run start:testnet
```

This registers as a solver, listens for `computation` and `search` tasks, and auto-fulfills them by sending the intent to an LLM via OpenRouter.

## How it works

1. The solver CLI receives a match and pipes it to `solve.ts` on stdin
2. `solve.ts` reads the intent and constraints
3. Sends a structured prompt to Claude (via OpenRouter) using the Vercel AI SDK
4. Parses the LLM response as JSON
5. Returns a `{ result, proof }` envelope to stdout

## Changing the model

Edit the `model` parameter in `solve.ts`:

```ts
model: openrouter("anthropic/claude-sonnet-4"),    // Claude
model: openrouter("openai/gpt-4o"),                 // GPT-4o
model: openrouter("meta-llama/llama-3.1-70b"),     // Llama
model: openrouter("google/gemini-2.0-flash"),       // Gemini
```

See [OpenRouter models](https://openrouter.ai/models) for the full list.

## Requirements

- [Bun](https://bun.sh) runtime
- OpenRouter API key
- Tempo wallet (`tempo wallet login`)
