/**
 * Prompt templates and tool schemas for all AI features. Kept in one file so
 * the AI Integration Report can reference them directly.
 */
import { SPECIALTIES } from '../common/enums';
import { ToolSchema } from './llm.client';
import { HistoryHit, KnowledgeHit } from '../knowledge/knowledge.service';

// ---------- Tool schemas (structured output — no regex parsing) ----------

export const RECOMMEND_TOOL: ToolSchema = {
  name: 'recommend_specialty',
  description:
    'Record the recommended clinic specialty for this patient based on their symptom description.',
  parameters: {
    type: 'object',
    properties: {
      specialty: { type: 'string', enum: [...SPECIALTIES] },
      rationale: { type: 'string', description: '1-2 sentences, plain language, addressed to the patient' },
      confidence: { type: 'string', enum: ['low', 'medium', 'high'] },
    },
    required: ['specialty', 'rationale', 'confidence'],
  },
};

export const SOAP_TOOL: ToolSchema = {
  name: 'format_soap_note',
  description:
    'Record the structured SOAP note and ICD-10 suggestions extracted from the raw consultation notes.',
  parameters: {
    type: 'object',
    properties: {
      subjective: { type: 'string' },
      objective: { type: 'string' },
      assessment: { type: 'string' },
      plan: { type: 'string' },
      icdSuggestions: {
        type: 'array',
        maxItems: 3,
        items: {
          type: 'object',
          properties: { code: { type: 'string' }, description: { type: 'string' } },
          required: ['code', 'description'],
        },
      },
    },
    required: ['subjective', 'objective', 'assessment', 'plan', 'icdSuggestions'],
  },
};

export const RECORD_INTAKE_SUMMARY_TOOL: ToolSchema = {
  name: 'record_intake_summary',
  description:
    'Call this once all five intake fields have been collected from the patient, to finalize and save the pre-visit intake summary. Do not call it before all fields are gathered.',
  parameters: {
    type: 'object',
    properties: {
      chiefComplaint: { type: 'string' },
      symptomDurationDays: { type: 'integer', minimum: 0 },
      severity: { type: 'integer', minimum: 1, maximum: 10 },
      relevantHistory: { type: 'string' },
      currentMedications: { type: 'string' },
      redFlags: { type: 'array', items: { type: 'string' } },
    },
    required: [
      'chiefComplaint', 'symptomDurationDays', 'severity',
      'relevantHistory', 'currentMedications', 'redFlags',
    ],
  },
};

export const SEARCH_KNOWLEDGE_BASE_TOOL: ToolSchema = {
  name: 'search_knowledge_base',
  description:
    "Search SmartClinic's internal triage guidance for red-flag symptom cues or intake best practices when unsure how to handle something the patient said. Use sparingly — only when genuinely uncertain.",
  parameters: {
    type: 'object',
    properties: { query: { type: 'string', description: 'A short description of what to look up' } },
    required: ['query'],
  },
};

// ---------- Feature 1: Patient Intake Chatbot (agentic) ----------

export const INTAKE_SYSTEM_PROMPT = `You are SmartClinic's pre-visit intake assistant, talking with a patient who has an appointment within the next 24 hours. You are NOT a doctor and must never diagnose, recommend treatment, or give medical advice.

Collect these five items, in order, ONE question at a time (keep each question short and friendly):
1. chiefComplaint — the main problem in the patient's words
2. symptomDurationDays — how long they have had it (convert to days)
3. severity — a number from 1 to 10
4. relevantHistory — relevant medical history / previous episodes
5. currentMedications — medications currently taken (or "none")

Rules:
- Ask exactly one question per turn. Acknowledge the previous answer briefly, in plain conversational text — never mention tools, JSON, or internal mechanics to the patient.
- If an answer is unclear, ask once to clarify, then accept it as given.
- If you are unsure whether something the patient said is a red flag or how to handle it, call search_knowledge_base to check the clinic's triage guidance before responding.
- If the patient describes emergency symptoms, tell them to contact emergency services immediately, note it as a red flag, and continue.
- Never invent information the patient did not provide.
- Once ALL five items are collected, call the record_intake_summary tool exactly once with the structured data. Do not repeat the summary in your reply text — just a short closing thank-you sentence.`;

export const INTAKE_OPENING_MESSAGE =
  "Hello! I'm SmartClinic's intake assistant. Before your appointment, I'd like to ask a few quick questions so your doctor is well prepared. First — what is the main problem or concern you'd like to discuss?";

// ---------- Feature 2: Smart Appointment Recommender (RAG) ----------

export const RECOMMEND_SYSTEM_PROMPT = `You are SmartClinic's appointment-routing assistant. The clinic offers exactly these specialties: ${SPECIALTIES.join(', ')}.

Given the patient's description, their retrieved past visit history, and the retrieved clinic routing guidance below, call the recommend_specialty tool exactly once. You are routing, not diagnosing — when uncertain, choose General Practice with lower confidence.`;

export function recommendUserPrompt(
  description: string,
  historyHits: HistoryHit[],
  knowledgeHits: KnowledgeHit[],
): string {
  const history = historyHits.length
    ? `\n\nMost relevant past visits (retrieved by semantic similarity):\n${historyHits
        .map((h) => `- ${h.assessment.slice(0, 200)}`)
        .join('\n')}`
    : '';
  const guidance = knowledgeHits.length
    ? `\n\nRelevant clinic routing guidance (retrieved):\n${knowledgeHits
        .map((k) => `- ${k.title}: ${k.content}`)
        .join('\n')}`
    : '';
  return `Patient's description: "${description}"${history}${guidance}`;
}

// ---------- Feature 3: Clinical Note Assistant (SOAP formatter, RAG) ----------

export const SOAP_SYSTEM_PROMPT = `You are a clinical documentation assistant for licensed doctors at SmartClinic. Convert the doctor's rough consultation notes into a structured SOAP note by calling the format_soap_note tool exactly once. The doctor will review and edit everything you produce — you are a formatting aid, not a decision maker.

Rules:
- Use ONLY information present in the doctor's notes. Never add findings, diagnoses, or plans that are not stated or directly implied.
- Distribute the content: Subjective (what the patient reported), Objective (examination findings, vitals, test results), Assessment (the doctor's clinical impression), Plan (treatment, prescriptions, follow-up, referrals).
- If a section has no content in the notes, use an empty string — do not fabricate.
- Suggest at most 3 ICD-10 codes that plausibly match the assessment, most likely first; the retrieved documentation guidance below may help.`;

export function soapUserPrompt(rawNotes: string, knowledgeHits: KnowledgeHit[]): string {
  const guidance = knowledgeHits.length
    ? `\n\nRetrieved documentation guidance:\n${knowledgeHits.map((k) => `- ${k.title}: ${k.content}`).join('\n')}`
    : '';
  return `Doctor's raw notes:\n"""\n${rawNotes}\n"""${guidance}`;
}
