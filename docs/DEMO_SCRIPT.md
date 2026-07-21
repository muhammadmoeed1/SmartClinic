# Demo Video Script (60–90 seconds)

A shot list for recording a short walkthrough once the app is running (locally
via `docker compose up -d` + `npm run dev`, or against the deployed live demo).
Use free screen-recording tools (OBS Studio, or macOS's built-in
Cmd+Shift+5) — no special setup needed. Aim for ~75 seconds; cut ruthlessly,
this is a trailer, not a tutorial.

## Before recording

- Seed fresh demo data so the calendar/records look populated, not empty.
- Have all four demo accounts' credentials visible (README's Demo Accounts
  table) or pre-filled in a password manager for fast switching.
- Set your browser zoom to 100% and window to a clean 1440×900-ish size —
  avoid dev tools/bookmarks bar clutter on screen.
- Close notifications (Slack, email) before recording.

## Shot list

**0:00–0:08 — Cold open on the live URL**
Show the browser address bar with the live demo URL, then the login page.
Caption/voiceover: *"SmartClinic — an AI-augmented clinic platform I built,
live at [url]."*

**0:08–0:20 — Patient: AI intake chatbot (the headline feature)**
Log in as the patient demo account → open the intake chatbot for an upcoming
appointment → type a symptom → **let the reply visibly stream token-by-token**
(this is the moment that sells "this isn't just a form with an API call
behind it") → show it asking a follow-up question naturally.

**0:20–0:32 — Patient: Smart Recommender**
Go to Book Appointment → type a symptom description into the AI recommender →
show the returned specialty + rationale + real doctor suggestions appearing.
Mention (voiceover or on-screen text): *"Recommendations are grounded in a
retrieved knowledge base and the patient's own history — not a bare model
guess."*

**0:32–0:44 — Doctor: SOAP note assistant**
Switch account (or split-screen) to the doctor view → open a visit → paste
rough consultation notes into the AI assistant → show the four SOAP fields
and ICD-10 suggestions populate → briefly show editing one field (demonstrates
human-in-the-loop, not blind trust).

**0:44–0:54 — Receptionist: booking board + no-show risk**
Switch to receptionist view → show the live booking calendar → hover an
appointment with a no-show risk badge → show the tooltip factors.

**0:54–1:04 — Admin: analytics + AI observability**
Switch to admin view → show the analytics dashboard charts → if you've set
`AI_API_KEY` and used the AI features enough to have data, hit
`GET /ai/observability` (via Swagger UI at `/api`, or just show the JSON in a
new tab) to show real latency/token/cost numbers — the "this isn't a toy"
proof point.

**1:04–1:12 — Close**
Cut back to the architecture diagram in the README (scroll to it, or have it
open in a second tab) for 2–3 seconds. Caption: *"Full write-up, architecture
diagrams, and source on GitHub."* End on the repo URL.

## Optional: a second, AI-focused cut (for an ML-engineering audience)

If submitting this alongside an AI/ML-focused application, consider a second,
more technical 90-second cut that skips the CRUD screens entirely and instead
narrates over the architecture diagram + AI_INTEGRATION.md:

1. (0:00–0:15) The Mermaid architecture diagram — point out the RAG,
   tool-use, and observability layers.
2. (0:15–0:35) The agentic intake sequence diagram — narrate the tool-call
   loop (search_knowledge_base → record_intake_summary).
3. (0:35–0:55) A terminal running `npm run eval` with `AI_API_KEY` set,
   showing real accuracy % and LLM-as-judge scores.
4. (0:55–1:10) The `/ai/observability` JSON response — real latency/token
   numbers.
5. (1:10–1:20) Close on the GitHub repo, README badges visible (CI green).

This version demonstrates engineering rigor over UI polish — better suited
to a technical reviewer who already knows what a booking calendar looks like
and wants to see the AI system internals instead.
