# Building an Evaluated, Guardrailed Clinical AI Assistant

*A technical write-up on SmartClinic's AI subsystem — RAG, tool-use, an agentic
loop, streaming, observability, and an eval harness, all running on a free
LLM tier.*

## The problem with "just call an LLM API"

It's easy to wire a chatbot into an app: send a system prompt, get text back,
show it on screen. It's much harder to build something you'd trust to sit in
front of real users — something where you can answer *"how do you know it
works?"* with evidence instead of vibes. That gap is what I wanted to close
with SmartClinic, a clinic-management platform with four AI-assisted
features: a pre-visit intake chatbot, a specialty recommender, a clinical
note formatter, and a no-show risk predictor.

The last one is deliberately *not* an LLM call — a rule-based weighted score
over booking history, lead time, and time slot. Worth saying up front,
because knowing when *not* to reach for an LLM is part of the same judgment
that makes the other three worth trusting.

## Grounding the model: RAG over two sources

The recommender and the note formatter both call out to a knowledge base
before they call the LLM. Two sources, both searched by pgvector cosine
distance rather than keyword match:

- A **static knowledge base** — specialty-routing rules, triage red-flag
  cues, SOAP documentation conventions — seeded once and rarely changing.
- **Each patient's own visit history** — embedded when a doctor finalizes a
  note, so the recommender retrieves the patient's *most semantically
  relevant* past visits instead of just the three most recent by date.

The embeddings themselves are computed **locally**, via a quantized MiniLM
model running in-process (`@xenova/transformers`) — no external embeddings
API, no per-call cost. The trade-off is real: a five-to-ten-second cold load
on first use, and lower retrieval quality than a large hosted embedding
model. For a knowledge base this size, that trade was worth it — and it's
the kind of trade-off I'd rather state explicitly than pretend doesn't
exist.

## Tool-use instead of "please reply with JSON"

The first version of these features (this being a course project that grew
up) asked the model to reply with a JSON object and parsed it out of the
text with a regex, tolerating code fences and stray prose. It worked, until
it didn't — one dropped brace and the whole response is unusable, and you
find out in production, not in a code review.

The fix was to stop asking nicely and start using the tool-calling contract
both major providers expose: define a JSON Schema, force (or offer) a tool
call, and let the provider itself validate the shape before it ever reaches
my code. `recommend_specialty` and `format_soap_note` are forced tool calls —
there's exactly one valid shape and I want it every time. It also meant
building one abstraction (`LlmClient.runAgentStep`) that speaks both
Anthropic's tool-use format and the OpenAI-compatible function-calling
format, so the rest of the app never touches a provider-specific response
shape.

## Making the intake bot agentic, not just conversational

The intake chatbot collects five structured fields through natural
conversation, then needs to hand off a clean object once it has them. The
naive version does this by having me, the backend, decide when the
conversation is "done" and asking the model to summarize on command. The
agentic version flips that: the model itself calls `record_intake_summary`
when *it* has decided the five fields are complete.

More interestingly, it also has a `search_knowledge_base` tool it can invoke
*mid-conversation*, on its own initiative, when something the patient says
sounds like it might be a red flag it's unsure how to handle. That's a small
but real design choice: instead of always stuffing triage guidance into
every prompt "just in case," the model decides when it's actually uncertain
enough to look something up. It's capped at three tool-hops per turn so a
confused model can't loop forever instead of replying — an agent without a
budget is a liability, not a feature.

## Streaming, honestly

The intake replies stream token-by-token over Server-Sent Events, using each
provider's real incremental output — not a `setTimeout` chopping up a string
that already finished generating. Tool-call arguments accumulate silently in
the background while the visible text streams live, and only surface once
the provider's stream actually ends. Getting this right meant handling two
different SSE event grammars (Anthropic's `content_block_delta` /
`message_delta`, OpenAI's `delta.tool_calls[].function.arguments`
accumulation) — the kind of provider-specific plumbing that's genuinely
tedious and exactly why I built it once, behind one interface, rather than
inline at each call site.

## The part that actually separates a demo from an engineered system

Anyone can call an LLM. What's harder — and what I think is the real signal
of "this person can operate an AI system, not just build one" — is the
instrumentation around it:

- **Every** call to the LLM client, success or failure, is logged: feature,
  provider, model, prompt version, tool invoked, latency, and input/output
  token counts (parsed from the provider's own usage field, including
  mid-stream). An admin endpoint aggregates this by feature — call count,
  success rate, average latency, total tokens.
- Prompts are **versioned**, and the version in effect is recorded on every
  logged call, so "did the new prompt actually improve anything" is a query,
  not a guess.
- An **eval harness** runs the recommender against ten hand-written cases
  (rule-based specialty-accuracy) and the note formatter against three
  (structural validity), plus an **LLM-as-judge** pass that scores each
  recommendation's rationale against a rubric — faithfulness to what the
  patient actually said, no diagnostic language, specificity. It's a known
  limitation that the judge shares a model family with what it's judging;
  I've written that down rather than glossed over it, because pretending a
  weakness doesn't exist is worse than naming it.
- A regex-based PII guardrail (emails, phone numbers, national ID numbers,
  card-like digit sequences) runs on every piece of free text before it
  reaches a prompt — not a compliance guarantee, a defense-in-depth layer.
- RAG lookups are cached (Redis, or in-memory when Redis isn't configured),
  cutting repeated embedding and database round-trips, with hit/miss counters
  surfaced in the same observability endpoint.

None of this is exotic. All of it is the difference between "I called
`chat.completions.create`" and "I can tell you exactly how often this
feature fails, what it costs, and why I trust the number."

## What I'd do differently with more time

- The eval judge should be a different, ideally stronger model than the one
  being judged — shared blind spots are a real limitation of the current
  setup.
- Local embeddings are the right call for a demo at this scale; they
  wouldn't be the right call at real knowledge-base size, where a hosted
  embedding model's quality would matter more than the cost saved.
- The agentic loop's three-hop cap is a blunt instrument. A model that
  genuinely needs a fourth lookup gets cut off with a generic apology — fine
  for a demo, not fine for production, where I'd want the cap to degrade
  more gracefully (e.g., fall back to asking the patient directly).

## Try it

Source, architecture diagrams, and the AI subsystem's full technical notes
are on GitHub: *[link]*. The app runs entirely without an AI key configured
too — every AI feature has a real, working manual fallback, because a demo
that only works when a third-party API is healthy isn't a demo I'd want to
depend on either.
