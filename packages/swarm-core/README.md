# Swarm core

Shared validated Planner → parallel specialists → critic → optional human review. `runSwarm` uses `Promise.allSettled`, per-attempt abort signals and timeouts, and at most one retry. A critic can inspect failures without losing successful specialist outputs. Retry only idempotent operations: a timed-out remote side effect cannot be undone by aborting a request.

`inputHash` produces SHA-256 over canonical JSON. `onStep` can persist ordered trace events. The SQL migration is a production trace-table starting point; local apps own their private durable JSON stores. Streaming and persistence are app-level responsibilities.

`@hackathon/swarm-core/providers` exposes `generateJson` and `modelAgent` for Gemini, Groq and the OpenAI Responses API. The model name, key and `enabled: true` are required. No provider is silently selected, and errors never fall back to a paid provider. Each adapter validates JSON with Zod. The apps currently use deterministic demo agents; provider adapters are available for subsequent live integration, and are tested with handwritten response shapes only.

Keys belong in server-only app configuration. Use only models supporting the supplied structured-output schema. Redaction handles obvious email addresses and US phone numbers; screening catches a few known injection patterns. Neither provides complete PII detection or prompt-injection protection.

API references verified October 19, 2026: [Gemini GenerateContent](https://ai.google.dev/api/generate-content), [Groq structured outputs](https://console.groq.com/docs/structured-outputs), [OpenAI structured outputs](https://developers.openai.com/api/docs/guides/structured-outputs?api-mode=responses). Live API calls have not been verified in this environment.
