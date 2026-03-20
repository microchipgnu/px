import { generateText } from "ai"
import { createOpenAI } from "@ai-sdk/openai"

// OpenRouter-compatible provider (uses OpenAI-compatible API)
const openrouter = createOpenAI({
  apiKey: process.env.OPENROUTER_API_KEY,
  baseURL: "https://openrouter.ai/api/v1",
})

// Read match data from stdin
const input = await Bun.stdin.text()
const match = JSON.parse(input)

const intent = match.intent as string
const taskClass = match.taskClass as string
const constraints = match.constraints ?? {}

// Build prompt
const systemPrompt = `You are a solver agent fulfilling tasks on payload.exchange.
You receive a task intent and must provide an accurate, structured JSON response.
Be concise and factual. Return ONLY valid JSON — no markdown, no explanation.`

const userPrompt = `Task class: ${taskClass}
Intent: ${intent}
Constraints: ${JSON.stringify(constraints)}

Respond with a JSON object containing the answer. Examples:
- For questions: {"answer": "..."}
- For data: {"data": [...]}
- For computations: {"result": ..., "explanation": "..."}`

const { text } = await generateText({
  // Use any model available on OpenRouter
  model: openrouter("anthropic/claude-sonnet-4"),
  system: systemPrompt,
  prompt: userPrompt,
  maxTokens: 1024,
})

// Parse the LLM response
let result: unknown
try {
  result = JSON.parse(text)
} catch {
  result = { answer: text }
}

// Output envelope
const output = {
  result,
  proof: {
    method: "llm",
    model: "anthropic/claude-sonnet-4",
    provider: "openrouter",
    timestamp: Math.floor(Date.now() / 1000),
  },
}

process.stdout.write(JSON.stringify(output))
