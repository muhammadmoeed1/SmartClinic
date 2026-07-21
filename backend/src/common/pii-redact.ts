/**
 * Best-effort PII redaction applied to free-text patient/doctor input before
 * it is sent to any LLM provider. Not a compliance guarantee — a defense-in-
 * depth guardrail alongside not sending patient identifiers (name, MRN) in
 * prompts at all (see AI_INTEGRATION.md).
 */
const PATTERNS: Array<{ label: string; regex: RegExp }> = [
  { label: 'email', regex: /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g },
  // Pakistani CNIC: 12345-1234567-1
  { label: 'cnic', regex: /\b\d{5}-\d{7}-\d\b/g },
  // Phone numbers: +92-300-1234567, (0300) 123-4567, 03001234567, etc.
  { label: 'phone', regex: /(?:\+?\d{1,3}[-.\s]?)?\(?\d{3,4}\)?[-.\s]?\d{3,4}[-.\s]?\d{3,4}\b/g },
  // Card-like sequences: 16 digits in groups of 4, or 13-19 contiguous digits
  { label: 'card_number', regex: /\b(?:\d[ -]?){13,19}\b/g },
];

export interface RedactionResult {
  redacted: string;
  found: string[];
}

export function redactPii(text: string): RedactionResult {
  let redacted = text;
  const found: string[] = [];
  for (const { label, regex } of PATTERNS) {
    if (regex.test(redacted)) found.push(label);
    regex.lastIndex = 0;
    redacted = redacted.replace(regex, `[REDACTED_${label.toUpperCase()}]`);
  }
  return { redacted, found };
}
