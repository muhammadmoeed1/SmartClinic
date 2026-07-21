import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { LlmObservabilityService } from './llm-observability.service';

export class AiUnavailableException extends ServiceUnavailableException {
  constructor() {
    super({ statusCode: 503, message: 'AI service unavailable', fallback: true });
  }
}

export interface ToolSchema {
  name: string;
  description: string;
  /** JSON Schema for the tool's input object. */
  parameters: Record<string, unknown>;
}

export interface ToolCall {
  id: string;
  name: string;
  input: any;
}

export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
}

/** One turn of an agentic conversation: a plain message, or an assistant
 *  turn that invoked a tool, or the result of executing that tool. */
export type AgentMessage =
  | { role: 'user'; content: string }
  | { role: 'assistant'; content: string; toolCall?: ToolCall }
  | { role: 'tool'; toolCallId: string; name: string; content: string };

export interface AgentStepResult {
  text: string;
  toolCall: ToolCall | null;
  usage: TokenUsage | null;
}

/** Emitted while streaming: incremental text as it's generated, then one
 *  final `done` event carrying the same shape runAgentStep() would return
 *  (including any accumulated tool call), once the provider's stream ends. */
export type AgentStreamEvent =
  | { type: 'text'; delta: string }
  | { type: 'done'; result: AgentStepResult };

export interface AgentStepOpts {
  maxTokens?: number;
  forceTool?: string;
  /** Which feature is calling (e.g. 'recommend', 'soap_format', 'intake') — logged for observability. */
  feature: string;
  /** Prompt/tool-schema version in use, for the prompt-versioning registry. */
  promptVersion?: string;
}

/**
 * Provider-agnostic LLM client (Anthropic Messages API or OpenAI-compatible
 * chat completions), selected via AI_PROVIDER. The API key never leaves this
 * backend module. Every call — success or failure — is logged via
 * LlmObservabilityService (latency, token usage, provider/model, prompt
 * version) for the admin observability endpoint and eval reports.
 *
 * Two calling styles, both supporting tools (structured output via JSON
 * Schema, validated by the provider, instead of asking the model to emit
 * JSON in free text and regex-parsing it):
 *  - runAgentStep(): a single non-streamed turn. Used for structured-output
 *    features (recommend, SOAP formatting) and, in a loop, the agentic
 *    intake flow.
 *  - streamAgentStep(): the same turn, but yields text deltas as the
 *    provider generates them (for the frontend to render live) and
 *    accumulates any tool-call arguments in the background, surfacing the
 *    complete result in a final `done` event.
 */
@Injectable()
export class LlmClient {
  private logger = new Logger('LLM');

  constructor(private observability: LlmObservabilityService) {}

  get available(): boolean {
    return !!process.env.AI_API_KEY;
  }

  private get provider(): 'anthropic' | 'openai' {
    return (process.env.AI_PROVIDER || 'anthropic').toLowerCase() === 'openai'
      ? 'openai'
      : 'anthropic';
  }

  private get modelName(): string {
    return process.env.AI_MODEL || (this.provider === 'openai' ? 'gpt-4o' : 'claude-sonnet-5');
  }

  async runAgentStep(
    system: string,
    history: AgentMessage[],
    tools: ToolSchema[] = [],
    opts: AgentStepOpts,
  ): Promise<AgentStepResult> {
    if (!this.available) throw new AiUnavailableException();
    const maxTokens = opts.maxTokens ?? 1024;
    const start = Date.now();
    try {
      const result = this.provider === 'openai'
        ? await this.openaiAgentStep(system, history, tools, maxTokens, opts.forceTool)
        : await this.anthropicAgentStep(system, history, tools, maxTokens, opts.forceTool);
      void this.observability.record({
        feature: opts.feature,
        provider: this.provider,
        model: this.modelName,
        promptVersion: opts.promptVersion,
        toolName: result.toolCall?.name ?? null,
        latencyMs: Date.now() - start,
        inputTokens: result.usage?.inputTokens ?? null,
        outputTokens: result.usage?.outputTokens ?? null,
        success: true,
      });
      return result;
    } catch (err) {
      void this.observability.record({
        feature: opts.feature,
        provider: this.provider,
        model: this.modelName,
        promptVersion: opts.promptVersion,
        latencyMs: Date.now() - start,
        success: false,
        errorMessage: (err as Error).message,
      });
      if (err instanceof AiUnavailableException) throw err;
      this.logger.error(`LLM agent step failed: ${(err as Error).message}`);
      throw new AiUnavailableException();
    }
  }

  async *streamAgentStep(
    system: string,
    history: AgentMessage[],
    tools: ToolSchema[] = [],
    opts: AgentStepOpts,
  ): AsyncGenerator<AgentStreamEvent, void, unknown> {
    if (!this.available) throw new AiUnavailableException();
    const maxTokens = opts.maxTokens ?? 1024;
    const start = Date.now();
    try {
      const gen = this.provider === 'openai'
        ? this.openaiStreamAgentStep(system, history, tools, maxTokens)
        : this.anthropicStreamAgentStep(system, history, tools, maxTokens);
      for await (const event of gen) {
        yield event;
        if (event.type === 'done') {
          void this.observability.record({
            feature: opts.feature,
            provider: this.provider,
            model: this.modelName,
            promptVersion: opts.promptVersion,
            toolName: event.result.toolCall?.name ?? null,
            latencyMs: Date.now() - start,
            inputTokens: event.result.usage?.inputTokens ?? null,
            outputTokens: event.result.usage?.outputTokens ?? null,
            success: true,
          });
        }
      }
    } catch (err) {
      void this.observability.record({
        feature: opts.feature,
        provider: this.provider,
        model: this.modelName,
        promptVersion: opts.promptVersion,
        latencyMs: Date.now() - start,
        success: false,
        errorMessage: (err as Error).message,
      });
      if (err instanceof AiUnavailableException) throw err;
      this.logger.error(`LLM stream failed: ${(err as Error).message}`);
      throw new AiUnavailableException();
    }
  }

  // ---------- Anthropic ----------

  private toAnthropicMessages(history: AgentMessage[]): any[] {
    return history.map((m) => {
      if (m.role === 'user') return { role: 'user', content: m.content };
      if (m.role === 'tool') {
        return {
          role: 'user',
          content: [{ type: 'tool_result', tool_use_id: m.toolCallId, content: m.content }],
        };
      }
      // assistant
      if (m.toolCall) {
        const content: any[] = [];
        if (m.content) content.push({ type: 'text', text: m.content });
        content.push({ type: 'tool_use', id: m.toolCall.id, name: m.toolCall.name, input: m.toolCall.input });
        return { role: 'assistant', content };
      }
      return { role: 'assistant', content: m.content };
    });
  }

  private async anthropicAgentStep(
    system: string,
    history: AgentMessage[],
    tools: ToolSchema[],
    maxTokens: number,
    forceTool?: string,
  ): Promise<AgentStepResult> {
    const body: Record<string, unknown> = {
      model: process.env.AI_MODEL || 'claude-sonnet-5',
      max_tokens: maxTokens,
      system,
      messages: this.toAnthropicMessages(history),
    };
    if (tools.length) {
      body.tools = tools.map((t) => ({
        name: t.name,
        description: t.description,
        input_schema: t.parameters,
      }));
      body.tool_choice = forceTool ? { type: 'tool', name: forceTool } : { type: 'auto' };
    }

    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': process.env.AI_API_KEY!,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`Anthropic API ${res.status}: ${await res.text()}`);
    const data: any = await res.json();

    let text = '';
    let toolCall: ToolCall | null = null;
    for (const block of data.content ?? []) {
      if (block.type === 'text') text += block.text;
      else if (block.type === 'tool_use' && !toolCall) {
        toolCall = { id: block.id, name: block.name, input: block.input };
      }
    }
    const usage: TokenUsage | null = data.usage
      ? { inputTokens: data.usage.input_tokens ?? 0, outputTokens: data.usage.output_tokens ?? 0 }
      : null;
    return { text, toolCall, usage };
  }

  private async *anthropicStreamAgentStep(
    system: string,
    history: AgentMessage[],
    tools: ToolSchema[],
    maxTokens: number,
  ): AsyncGenerator<AgentStreamEvent, void, unknown> {
    const body: Record<string, unknown> = {
      model: process.env.AI_MODEL || 'claude-sonnet-5',
      max_tokens: maxTokens,
      system,
      messages: this.toAnthropicMessages(history),
      stream: true,
    };
    if (tools.length) {
      body.tools = tools.map((t) => ({
        name: t.name,
        description: t.description,
        input_schema: t.parameters,
      }));
      body.tool_choice = { type: 'auto' };
    }

    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': process.env.AI_API_KEY!,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify(body),
    });
    if (!res.ok || !res.body) throw new Error(`Anthropic API ${res.status}: ${await res.text()}`);

    let text = '';
    let toolCall: ToolCall | null = null;
    let toolJsonBuffer = '';
    let currentBlockType: string | null = null;
    let inputTokens = 0;
    let outputTokens = 0;

    for await (const payload of parseSseStream(res.body)) {
      if (payload === '[DONE]') break;
      let event: any;
      try {
        event = JSON.parse(payload);
      } catch {
        continue;
      }

      if (event.type === 'message_start') {
        inputTokens = event.message?.usage?.input_tokens ?? 0;
      } else if (event.type === 'content_block_start') {
        currentBlockType = event.content_block?.type ?? null;
        if (currentBlockType === 'tool_use') {
          toolCall = { id: event.content_block.id, name: event.content_block.name, input: {} };
          toolJsonBuffer = '';
        }
      } else if (event.type === 'content_block_delta') {
        if (event.delta?.type === 'text_delta') {
          text += event.delta.text;
          yield { type: 'text', delta: event.delta.text as string };
        } else if (event.delta?.type === 'input_json_delta') {
          toolJsonBuffer += event.delta.partial_json ?? '';
        }
      } else if (event.type === 'content_block_stop') {
        if (currentBlockType === 'tool_use' && toolCall) {
          try {
            toolCall.input = toolJsonBuffer ? JSON.parse(toolJsonBuffer) : {};
          } catch {
            toolCall.input = {};
          }
        }
        currentBlockType = null;
      } else if (event.type === 'message_delta') {
        outputTokens = event.usage?.output_tokens ?? outputTokens;
      } else if (event.type === 'message_stop') {
        break;
      }
    }
    const usage: TokenUsage | null = inputTokens || outputTokens ? { inputTokens, outputTokens } : null;
    yield { type: 'done', result: { text, toolCall, usage } };
  }

  // ---------- OpenAI-compatible ----------

  private toOpenAiMessages(system: string, history: AgentMessage[]): any[] {
    const messages: any[] = [{ role: 'system', content: system }];
    for (const m of history) {
      if (m.role === 'user') {
        messages.push({ role: 'user', content: m.content });
      } else if (m.role === 'tool') {
        messages.push({ role: 'tool', tool_call_id: m.toolCallId, content: m.content });
      } else if (m.toolCall) {
        messages.push({
          role: 'assistant',
          content: m.content || null,
          tool_calls: [
            {
              id: m.toolCall.id,
              type: 'function',
              function: { name: m.toolCall.name, arguments: JSON.stringify(m.toolCall.input) },
            },
          ],
        });
      } else {
        messages.push({ role: 'assistant', content: m.content });
      }
    }
    return messages;
  }

  private async openaiAgentStep(
    system: string,
    history: AgentMessage[],
    tools: ToolSchema[],
    maxTokens: number,
    forceTool?: string,
  ): Promise<AgentStepResult> {
    const baseUrl = process.env.AI_BASE_URL || 'https://api.openai.com/v1';
    const body: Record<string, unknown> = {
      model: process.env.AI_MODEL || 'gpt-4o',
      max_tokens: maxTokens,
      messages: this.toOpenAiMessages(system, history),
    };
    if (tools.length) {
      body.tools = tools.map((t) => ({
        type: 'function',
        function: { name: t.name, description: t.description, parameters: t.parameters },
      }));
      body.tool_choice = forceTool ? { type: 'function', function: { name: forceTool } } : 'auto';
    }

    const res = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${process.env.AI_API_KEY}`,
      },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`OpenAI API ${res.status}: ${await res.text()}`);
    const data: any = await res.json();
    const msg = data.choices?.[0]?.message ?? {};

    let toolCall: ToolCall | null = null;
    const tc = msg.tool_calls?.[0];
    if (tc) {
      let input: any = {};
      try {
        input = JSON.parse(tc.function.arguments);
      } catch {
        input = {};
      }
      toolCall = { id: tc.id, name: tc.function.name, input };
    }
    const usage: TokenUsage | null = data.usage
      ? { inputTokens: data.usage.prompt_tokens ?? 0, outputTokens: data.usage.completion_tokens ?? 0 }
      : null;
    return { text: msg.content ?? '', toolCall, usage };
  }

  private async *openaiStreamAgentStep(
    system: string,
    history: AgentMessage[],
    tools: ToolSchema[],
    maxTokens: number,
  ): AsyncGenerator<AgentStreamEvent, void, unknown> {
    const baseUrl = process.env.AI_BASE_URL || 'https://api.openai.com/v1';
    const body: Record<string, unknown> = {
      model: process.env.AI_MODEL || 'gpt-4o',
      max_tokens: maxTokens,
      messages: this.toOpenAiMessages(system, history),
      stream: true,
      stream_options: { include_usage: true },
    };
    if (tools.length) {
      body.tools = tools.map((t) => ({
        type: 'function',
        function: { name: t.name, description: t.description, parameters: t.parameters },
      }));
      body.tool_choice = 'auto';
    }

    const res = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${process.env.AI_API_KEY}`,
      },
      body: JSON.stringify(body),
    });
    if (!res.ok || !res.body) throw new Error(`OpenAI API ${res.status}: ${await res.text()}`);

    let text = '';
    let toolAcc: { id?: string; name?: string; args: string } | null = null;
    let usage: TokenUsage | null = null;

    for await (const payload of parseSseStream(res.body)) {
      if (payload === '[DONE]') break;
      let event: any;
      try {
        event = JSON.parse(payload);
      } catch {
        continue;
      }
      if (event.usage) {
        usage = {
          inputTokens: event.usage.prompt_tokens ?? 0,
          outputTokens: event.usage.completion_tokens ?? 0,
        };
      }
      const delta = event.choices?.[0]?.delta;
      if (!delta) continue;

      if (delta.content) {
        text += delta.content;
        yield { type: 'text', delta: delta.content as string };
      }
      if (delta.tool_calls) {
        for (const tc of delta.tool_calls) {
          if (!toolAcc) toolAcc = { args: '' };
          if (tc.id) toolAcc.id = tc.id;
          if (tc.function?.name) toolAcc.name = tc.function.name;
          if (tc.function?.arguments) toolAcc.args += tc.function.arguments;
        }
      }
    }

    let toolCall: ToolCall | null = null;
    if (toolAcc?.name) {
      let input: any = {};
      try {
        input = toolAcc.args ? JSON.parse(toolAcc.args) : {};
      } catch {
        input = {};
      }
      toolCall = { id: toolAcc.id ?? toolAcc.name, name: toolAcc.name, input };
    }
    yield { type: 'done', result: { text, toolCall, usage } };
  }
}

/** Reads a `text/event-stream` body and yields each `data:` line's payload. */
async function* parseSseStream(body: ReadableStream<Uint8Array>): AsyncGenerator<string, void, unknown> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed.startsWith('data:')) continue;
        yield trimmed.slice(5).trim();
      }
    }
  } finally {
    reader.releaseLock();
  }
}
