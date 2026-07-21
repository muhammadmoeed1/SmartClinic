# SmartClinic — AI Integration Technical Notes

> Reference material for the AI Integration Report. The full prompt templates
> and tool schemas live in `backend/src/ai/prompts.ts` — they are the single
> source of truth used at runtime.

## Architecture

```
React (no keys, no direct LLM calls)
   │  REST + SSE
   ▼
NestJS AI proxy module (backend/src/ai/)
   ├── ai.controller.ts          role-guarded endpoints (incl. SSE stream, /ai/observability)
   ├── ai.service.ts             feature logic + agentic intake loop + PII redaction
   ├── llm.client.ts             provider-agnostic client: tool-use + streaming + usage capture
   ├── llm-observability.service.ts  logs every call (latency/tokens/success) to llm_calls
   ├── prompts.ts                system prompts + tool JSON Schemas + PROMPT_VERSIONS
   └── no-show.service.ts        rule-based risk scoring (no LLM)
   │
   ├──▶ common/session-store.ts        Redis-or-memory keyed store (sessions AND RAG cache)
   ├──▶ common/pii-redact.ts           regex-based PII guardrail applied before every LLM call
   ├──▶ knowledge/knowledge.service.ts RAG search (pgvector cosine distance) + result caching
   │       └── embedding/embedding.service.ts  local MiniLM embeddings (no API)
   └──▶ eval/run-eval.ts               offline eval harness (accuracy + LLM-as-judge)
   │
   │  HTTPS (AI_API_KEY from .env, never sent to the frontend)
   ▼
LLM API (AI_PROVIDER=anthropic|openai, AI_MODEL from .env)
```

The mandatory "AI proxy between frontend and LLM" constraint is met by role
guards on `/ai/*` plus the key living only in backend env — including for the
streaming endpoint, which still goes through the same guards before the
handler ever touches the response.

## Retrieval-Augmented Generation (RAG)

Two pgvector-backed sources, both searched by cosine distance (`<=>`), not
keyword match:

1. **Static knowledge base** (`knowledge_chunks` table) — specialty-routing
   guidance, triage red-flag cues, and SOAP documentation tips, seeded via
   `npm run seed:knowledge` (see `backend/src/database/knowledge-base.ts`).
2. **Patient visit history** (`visit_records.embedding`) — each finalized
   visit record is embedded (`RecordsService.embedRecord`) so the recommender
   can retrieve a patient's *most semantically relevant* past visits instead
   of just the most recent ones chronologically.

Embeddings are computed **locally and for free** via `@xenova/transformers`
running a quantized MiniLM model in-process (`EmbeddingService`) — no
external embeddings API, no additional cost. The model loads lazily on first
use and any failure degrades to "no RAG context" rather than breaking the
request, consistent with the rest of this project's AI degradation
philosophy.

## Tool-use / structured output

Every feature that needs structured data calls a provider tool (JSON-Schema
validated function/tool call) instead of asking the model to emit JSON in
free text and parsing it with regex:

- `recommend_specialty` — forced tool call for the Smart Recommender.
- `format_soap_note` — forced tool call for the SOAP formatter.
- `record_intake_summary` — the intake chatbot calls this itself, once all
  five fields are collected, instead of emitting a `<SUMMARY>` marker.
- `search_knowledge_base` — the intake chatbot can call this *itself*, mid
  conversation, when unsure how to handle something the patient said (an
  agentic step: the model decides when to retrieve, not the backend).

`LlmClient.runAgentStep()` implements this once per provider (Anthropic tool
use / OpenAI-compatible function calling) so callers never touch raw
provider response shapes.

## Observability

Every `runAgentStep`/`streamAgentStep` call — success or failure — is logged
to the `llm_calls` table via `LlmObservabilityService`: feature name,
provider, model, prompt version, tool called (if any), latency, input/output
token counts (parsed from the provider's `usage` field, including from
streamed responses), and outcome. `GET /ai/observability` (admin only)
aggregates this by feature (call count, success rate, avg latency, total
tokens) plus the RAG cache hit rate — the basis for a cost/latency dashboard.
Logging failures never break the calling feature (best-effort, wrapped in
try/catch).

## Prompt versioning

`prompts.ts` exports `PROMPT_VERSIONS` — a version tag per feature (e.g.
`recommend-v2-rag-tools`), recorded on every logged call. Bump the tag
whenever a prompt or tool schema changes meaningfully, so eval results and
observability stats can be sliced by "which version produced this."

## Guardrails

- **PII redaction** (`common/pii-redact.ts`): regex-based best-effort
  redaction (emails, phone numbers, Pakistani CNIC numbers, card-like digit
  sequences) applied to every piece of patient/doctor free text before it
  reaches a prompt — the intake chatbot's messages, the recommender's
  description, and the SOAP formatter's raw notes. Not a compliance
  guarantee; a defense-in-depth layer alongside never sending patient
  identifiers (name, MRN) in prompts at all.
- **Hallucination guards** (existing, from Phase 2): the recommended
  specialty is checked against the real catalogue and real bookable doctors
  are attached server-side, never model-invented; tool-call arguments are
  JSON-Schema validated by the provider itself.

## Caching

`KnowledgeService` caches RAG search results (Redis-or-memory via
`SessionStore`, keyed by a hash of the normalized query) — the static
knowledge base for 24h (content only changes on re-seed), patient history
for 10 minutes (changes whenever a visit is finalized). Hit/miss counters
are exposed via `cacheStats` and surfaced in `/ai/observability`, avoiding
redundant embedding + database round-trips for repeated lookups.

## Eval harness

`backend/src/eval/run-eval.ts` (`npm run eval`) runs the Smart Recommender
against 10 curated cases (rule-based specialty-accuracy metric) and the SOAP
formatter against 3 (structural-validity metric: does the tool call return
non-empty required sections), then runs an **LLM-as-judge** pass
(`eval/judge.ts`) scoring each recommender rationale 1-5 against a rubric
(faithfulness to the description, no diagnostic language, specificity).
Requires `AI_API_KEY`; skips gracefully (exit 0) when unset, so it's safe to
run unconditionally in CI — it only gates the build when a key is configured
(via the `AI_API_KEY` repo secret) and quality drops below threshold.

## Feature 1 — Patient Intake Chatbot (agentic + streamed)

- **Endpoints**: `POST /ai/intake/start`, `POST /ai/intake/message` (buffered),
  `POST /ai/intake/message/stream` (Server-Sent Events), fallback
  `POST /ai/intake/manual`, doctor view `GET /ai/triage/:appointmentId`.
- **Eligibility**: server verifies a `scheduled` appointment within 24h before
  starting a session.
- **Context management**: the full agent message history (including any tool
  calls/results) is kept in `SessionStore`, keyed by `sessionId` (1-hour TTL).
  Backed by Redis when `REDIS_URL` is set (required once there's more than
  one backend instance) or in-process memory otherwise. The frontend only
  ever sends the latest user message — it cannot tamper with history.
- **Agentic loop**: each turn, the model can call `search_knowledge_base`
  (executed server-side, result fed back for another turn, capped at 3 hops)
  before replying, and must call `record_intake_summary` once all five
  fields are collected.
- **Streaming**: the streamed endpoint yields the assistant's reply as text
  deltas in real time (`AgentStreamEvent`) while accumulating any tool-call
  arguments in the background; a final `done` event carries completion
  status. The non-streamed endpoint runs the same loop without incremental
  output, for simpler clients.
- **Safety rails in the prompt**: one question per turn, no diagnosis/advice,
  red-flag escalation wording, no invented data.
- **Graceful degradation**: if `AI_API_KEY` is unset or the provider errors,
  the API returns `503 { fallback: true }` (or an SSE `error` event with
  `fallback: true`) and the React widget swaps to a static intake form.

## Feature 2 — Smart Appointment Recommender (RAG)

- **Endpoint**: `POST /ai/recommend` (patient only).
- **Input**: free-text description, plus RAG-retrieved context: the
  patient's most semantically similar past visit assessments and the most
  relevant specialty-routing knowledge chunks.
- **Output contract**: forced `recommend_specialty` tool call — the provider
  validates the shape, no text parsing. The specialty is still checked
  against the catalogue defensively; the backend attaches the top-2 real
  bookable doctors of that specialty from the DB, so doctor suggestions are
  never hallucinated.
- **Transparency**: `rationale` is displayed to the patient verbatim; patient
  can always override manually.
- **Degradation**: 503 → the booking wizard skips straight to manual
  specialty selection.

## Feature 3 — Clinical Note Assistant (SOAP formatter, RAG)

- **Endpoint**: `POST /ai/soap-format` (doctor only).
- **RAG context**: retrieves relevant documentation-guidance chunks (SOAP
  section conventions, common ICD-10 codes per specialty) to ground the
  formatting and code suggestions.
- **Output contract**: forced `format_soap_note` tool call.
- **Prompt principles**: use only information present in the notes; empty
  string for absent sections (anti-hallucination); max 3 ICD-10 suggestions
  ordered by likelihood; the model is framed as a "formatting aid, not a
  decision maker".
- **Human-in-the-loop**: the response only pre-fills the four editable SOAP
  fields; the doctor reviews, edits, accepts/dismisses each ICD chip, and
  saving works entirely without the AI (manual path is independent).
- **Degradation**: 503 → non-blocking toast; manual editing continues.

## Feature 4 — No-Show Risk Predictor (bonus, no LLM)

- **Endpoint**: `GET /ai/no-show-risk?date=` (receptionist/admin).
- Rule-based scoring in `no-show.service.ts`: base 0.10, + up to 0.44 for past
  no-show rate, +0.08 for new patients, +0.07–0.15 for long booking lead
  time, +0.07 for edge-of-day slots, +0.05 for Mon/Fri, +0.05 for elective
  specialty; clamped at 0.95. Each contribution appends a human-readable
  factor string shown in the calendar tooltip.
- Appointments with `score > 0.65` get the warning badge; the receptionist
  can fire the mock SMS reminder (`POST /notifications/reminder/:id`).

## Suggested talking points for the report (write in your own words)

1. Why tool-use/function-calling is more robust than asking for free-text
   JSON: the provider validates the shape against a schema, so there's no
   parsing failure mode to handle.
2. Why RAG changes the recommend/SOAP prompts qualitatively: the model is
   grounded in retrieved facts (this patient's actual history, this clinic's
   actual routing rules) instead of relying purely on parametric knowledge.
3. The agentic design choice in the intake bot: giving the model a retrieval
   *tool* rather than always injecting knowledge-base context up front — the
   model decides when it's actually uncertain enough to look something up.
4. Local embeddings tradeoff: zero cost and no external dependency, at the
   cost of a ~5-10s cold load on first use and lower quality than a larger
   hosted embedding model — reasonable for this scale of knowledge base.
5. Privacy: patient identifiers are *not* sent to the LLM (only description/
   notes text and retrieved context); still, symptom text is PHI — discuss
   provider data-retention policies, the .env key handling, and why the
   proxy layer is the enforcement point.
6. Why observability matters even for a demo: without per-call logging,
   "the AI feature is slow/expensive/wrong" has no evidence trail — the
   `llm_calls` table turns vague complaints into "feature X averages 1.8s
   and 40% of failures are from provider timeouts."
7. LLM-as-judge limitations: judging with the same model/provider being
   judged is a known weakness (shared blind spots) — a stronger or
   independent judge model would be more rigorous; documented here as a
   conscious scope tradeoff, not an oversight.
