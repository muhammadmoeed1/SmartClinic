import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

export class AiUnavailableException extends ServiceUnavailableException {
  constructor() {
    super({ statusCode: 503, message: 'AI service unavailable', fallback: true });
  }
}

/**
 * The API key never leaves this backend module.
 */
@Injectable()
export class LlmClient {
  private logger = new Logger('LLM');

  get available(): boolean {
    return !!process.env.AI_API_KEY;
  }

  async chat(system: string, messages: ChatMessage[], maxTokens = 1024): Promise<string> {
    if (!this.available) throw new AiUnavailableException();
    const provider = (process.env.AI_PROVIDER || 'anthropic').toLowerCase();
    try {
      return provider === 'openai'
        ? await this.openai(system, messages, maxTokens)
        : await this.anthropic(system, messages, maxTokens);
    } catch (err) {
      if (err instanceof AiUnavailableException) throw err;
      this.logger.error(`LLM call failed: ${(err as Error).message}`);
      throw new AiUnavailableException();
    }
  }

  private async anthropic(system: string, messages: ChatMessage[], maxTokens: number) {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': process.env.AI_API_KEY!,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: process.env.AI_MODEL || 'claude-sonnet-5',
        max_tokens: maxTokens,
        system,
        messages,
      }),
    });
    if (!res.ok) {
      throw new Error(`Anthropic API ${res.status}: ${await res.text()}`);
    }
    const data: any = await res.json();
    return data.content?.map((b: any) => b.text ?? '').join('') ?? '';
  }

  private async openai(system: string, messages: ChatMessage[], maxTokens: number) {
    const baseUrl = process.env.AI_BASE_URL || 'https://api.openai.com/v1';
    const res = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${process.env.AI_API_KEY}`,
      },
      body: JSON.stringify({
        model: process.env.AI_MODEL || 'gpt-4o',
        max_tokens: maxTokens,
        messages: [{ role: 'system', content: system }, ...messages],
      }),
    });
    if (!res.ok) {
      throw new Error(`OpenAI API ${res.status}: ${await res.text()}`);
    }
    const data: any = await res.json();
    return data.choices?.[0]?.message?.content ?? '';
  }
}

/** Extract the first JSON object from an LLM reply (tolerates ``` fences and prose). */
export function extractJson<T = any>(text: string): T | null {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const candidate = fenced ? fenced[1] : text;
  const start = candidate.indexOf('{');
  const end = candidate.lastIndexOf('}');
  if (start === -1 || end <= start) return null;
  try {
    return JSON.parse(candidate.slice(start, end + 1)) as T;
  } catch {
    return null;
  }
}