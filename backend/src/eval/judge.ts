import { LlmClient, ToolSchema } from '../ai/llm.client';

export const JUDGE_TOOL: ToolSchema = {
  name: 'score_response',
  description: 'Score the quality of an AI assistant response against a rubric.',
  parameters: {
    type: 'object',
    properties: {
      score: { type: 'integer', minimum: 1, maximum: 5, description: '1 = poor, 5 = excellent' },
      reasoning: { type: 'string', description: 'One or two sentences justifying the score' },
    },
    required: ['score', 'reasoning'],
  },
};

const JUDGE_SYSTEM_PROMPT = `You are a strict evaluator of a clinic appointment-routing assistant. You are NOT the assistant being evaluated — judge its output independently and skeptically.

Score 1-5 how well the given rationale justifies the recommended specialty for the given patient description. Penalize:
- claims not supported by the patient's description (hallucination)
- language that diagnoses or gives medical advice (the assistant should only route, not diagnose)
- vague or generic rationale that doesn't reference the actual symptoms described

Call score_response exactly once with your score and reasoning.`;

export interface JudgeVerdict {
  score: number;
  reasoning: string;
}

/** LLM-as-judge: scores a recommend() rationale for faithfulness and routing
 * (not diagnostic) framing. Uses the same configured provider/model as the
 * feature being judged — ideally a separate, stronger model would judge, but
 * this project only provisions one API key; documented as a known limitation. */
export async function judgeRationale(
  llm: LlmClient,
  description: string,
  specialty: string,
  rationale: string,
): Promise<JudgeVerdict | null> {
  const step = await llm.runAgentStep(
    JUDGE_SYSTEM_PROMPT,
    [
      {
        role: 'user',
        content: `Patient description: "${description}"\nRecommended specialty: ${specialty}\nRationale given to the patient: "${rationale}"`,
      },
    ],
    [JUDGE_TOOL],
    { maxTokens: 256, forceTool: JUDGE_TOOL.name, feature: 'eval_judge' },
  );
  return (step.toolCall?.input as JudgeVerdict) ?? null;
}
