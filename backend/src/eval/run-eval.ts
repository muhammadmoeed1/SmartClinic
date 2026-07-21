/**
 * LLM evaluation harness for the Smart Recommender and SOAP formatter.
 * Runs against the REAL configured provider (no DB required — evaluates
 * prompt/tool-call quality in isolation from retrieval), so it needs
 * AI_API_KEY set. Skips gracefully (exit 0) when it isn't, so this is safe
 * to run unconditionally in CI: it only gates the build when a key IS
 * configured and quality regresses.
 *
 * Run with: npm run eval
 */
import 'reflect-metadata';
import { LlmClient } from '../ai/llm.client';
import { LlmObservabilityService } from '../ai/llm-observability.service';
import {
  RECOMMEND_SYSTEM_PROMPT, RECOMMEND_TOOL, SOAP_SYSTEM_PROMPT, SOAP_TOOL,
  recommendUserPrompt, soapUserPrompt,
} from '../ai/prompts';
import { RECOMMEND_CASES, SOAP_CASES } from './dataset';
import { judgeRationale } from './judge';

// No DB in this harness, so no rows to write — a no-op keeps LlmClient's
// observability call a no-op instead of pulling in TypeORM/DataSource.
const noopObservability = { record: async () => {} } as unknown as LlmObservabilityService;

const ACCURACY_THRESHOLD = 0.7;
const JUDGE_SCORE_THRESHOLD = 3;

async function evalRecommend(llm: LlmClient) {
  console.log('\n=== Smart Recommender eval (specialty accuracy) ===');
  let correct = 0;
  const judged: Array<{ description: string; specialty: string; rationale: string }> = [];

  for (const c of RECOMMEND_CASES) {
    const step = await llm.runAgentStep(
      RECOMMEND_SYSTEM_PROMPT,
      [{ role: 'user', content: recommendUserPrompt(c.description, [], []) }],
      [RECOMMEND_TOOL],
      { maxTokens: 512, forceTool: RECOMMEND_TOOL.name, feature: 'eval_recommend' },
    );
    const got = step.toolCall?.input?.specialty;
    const ok = got === c.expectedSpecialty;
    if (ok) correct++;
    console.log(`  [${ok ? 'PASS' : 'FAIL'}] "${c.description.slice(0, 55)}..." expected=${c.expectedSpecialty} got=${got ?? '(no tool call)'}`);
    if (step.toolCall?.input?.rationale) {
      judged.push({ description: c.description, specialty: got, rationale: step.toolCall.input.rationale });
    }
  }

  const accuracy = correct / RECOMMEND_CASES.length;
  console.log(`Specialty accuracy: ${(accuracy * 100).toFixed(1)}% (${correct}/${RECOMMEND_CASES.length})`);

  console.log('\n=== LLM-as-judge: rationale quality ===');
  const scores: number[] = [];
  for (const j of judged) {
    const verdict = await judgeRationale(llm, j.description, j.specialty, j.rationale);
    if (verdict) {
      scores.push(verdict.score);
      console.log(`  score=${verdict.score}/5 — ${verdict.reasoning}`);
    }
  }
  const avgScore = scores.length ? scores.reduce((a, b) => a + b, 0) / scores.length : 0;
  console.log(`Average judge score: ${avgScore.toFixed(2)}/5 (n=${scores.length})`);

  return { accuracy, avgScore };
}

async function evalSoap(llm: LlmClient) {
  console.log('\n=== SOAP formatter eval (structural validity) ===');
  let valid = 0;
  for (const c of SOAP_CASES) {
    const step = await llm.runAgentStep(
      SOAP_SYSTEM_PROMPT,
      [{ role: 'user', content: soapUserPrompt(c.rawNotes, []) }],
      [SOAP_TOOL],
      { maxTokens: 1024, forceTool: SOAP_TOOL.name, feature: 'eval_soap' },
    );
    const input = step.toolCall?.input;
    const ok = !!input && c.expectNonEmptySections.every((k) => !!input[k]);
    if (ok) valid++;
    console.log(`  [${ok ? 'PASS' : 'FAIL'}] "${c.rawNotes.slice(0, 55)}..."`);
  }
  const validity = valid / SOAP_CASES.length;
  console.log(`Structural validity: ${(validity * 100).toFixed(1)}% (${valid}/${SOAP_CASES.length})`);
  return { validity };
}

async function main() {
  if (!process.env.AI_API_KEY) {
    console.log('AI_API_KEY not set — skipping eval run (expected in CI without a configured key).');
    return;
  }

  const llm = new LlmClient(noopObservability);
  const recommendResult = await evalRecommend(llm);
  const soapResult = await evalSoap(llm);

  console.log('\n=== Summary ===');
  console.log(`Recommend accuracy: ${(recommendResult.accuracy * 100).toFixed(1)}% (threshold ${ACCURACY_THRESHOLD * 100}%)`);
  console.log(`Recommend judge score: ${recommendResult.avgScore.toFixed(2)}/5 (threshold ${JUDGE_SCORE_THRESHOLD}/5)`);
  console.log(`SOAP structural validity: ${(soapResult.validity * 100).toFixed(1)}%`);

  if (recommendResult.accuracy < ACCURACY_THRESHOLD || recommendResult.avgScore < JUDGE_SCORE_THRESHOLD) {
    console.error('\nEval thresholds not met.');
    process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error('Eval run failed', err);
  process.exit(1);
});
