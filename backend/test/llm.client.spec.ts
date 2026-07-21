import { AiUnavailableException, AgentMessage, LlmClient, ToolSchema } from '../src/ai/llm.client';
import { LlmObservabilityService } from '../src/ai/llm-observability.service';

const TOOL: ToolSchema = {
  name: 'pick_one',
  description: 'test tool',
  parameters: { type: 'object', properties: { value: { type: 'string' } }, required: ['value'] },
};

function jsonResponse(body: unknown, ok = true): Response {
  return {
    ok,
    status: ok ? 200 : 500,
    json: async () => body,
    text: async () => JSON.stringify(body),
  } as unknown as Response;
}

/** Builds a fake SSE Response whose body streams the given `data:` payloads. */
function sseResponse(payloads: string[]): Response {
  const encoder = new TextEncoder();
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const payload of payloads) {
        controller.enqueue(encoder.encode(`data: ${payload}\n\n`));
      }
      controller.close();
    },
  });
  return { ok: true, status: 200, body } as unknown as Response;
}

describe('LlmClient', () => {
  const originalEnv = { ...process.env };
  const observability = { record: jest.fn().mockResolvedValue(undefined) } as unknown as LlmObservabilityService;
  let client: LlmClient;

  beforeEach(() => {
    process.env.AI_API_KEY = 'test-key';
    client = new LlmClient(observability);
    global.fetch = jest.fn();
    jest.clearAllMocks();
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    jest.restoreAllMocks();
  });

  it('throws AiUnavailableException when no API key is configured', async () => {
    delete process.env.AI_API_KEY;
    client = new LlmClient(observability);
    await expect(
      client.runAgentStep('sys', [{ role: 'user', content: 'hi' }], [], { feature: 'test' }),
    ).rejects.toThrow(AiUnavailableException);
  });

  describe('anthropic provider', () => {
    beforeEach(() => {
      process.env.AI_PROVIDER = 'anthropic';
      process.env.AI_MODEL = 'claude-sonnet-5';
    });

    it('sends tool_choice and parses a tool_use response, logging the call', async () => {
      (global.fetch as jest.Mock).mockResolvedValue(
        jsonResponse({
          content: [
            { type: 'text', text: 'Sure, here you go.' },
            { type: 'tool_use', id: 'tu_1', name: 'pick_one', input: { value: 'x' } },
          ],
          usage: { input_tokens: 12, output_tokens: 5 },
        }),
      );

      const history: AgentMessage[] = [{ role: 'user', content: 'pick something' }];
      const result = await client.runAgentStep('sys', history, [TOOL], {
        forceTool: 'pick_one',
        feature: 'test',
        promptVersion: 'v1',
      });

      expect(result.toolCall).toEqual({ id: 'tu_1', name: 'pick_one', input: { value: 'x' } });
      expect(result.text).toBe('Sure, here you go.');
      expect(result.usage).toEqual({ inputTokens: 12, outputTokens: 5 });

      const [, init] = (global.fetch as jest.Mock).mock.calls[0];
      const body = JSON.parse(init.body);
      expect(body.tool_choice).toEqual({ type: 'tool', name: 'pick_one' });
      expect(body.tools[0]).toMatchObject({ name: 'pick_one', input_schema: TOOL.parameters });

      expect(observability.record).toHaveBeenCalledWith(
        expect.objectContaining({
          feature: 'test',
          promptVersion: 'v1',
          toolName: 'pick_one',
          success: true,
          inputTokens: 12,
          outputTokens: 5,
        }),
      );
    });

    it('returns plain text with no tool call when the model does not call one', async () => {
      (global.fetch as jest.Mock).mockResolvedValue(
        jsonResponse({ content: [{ type: 'text', text: 'Just chatting.' }] }),
      );
      const result = await client.runAgentStep('sys', [{ role: 'user', content: 'hi' }], [], {
        feature: 'test',
      });
      expect(result).toEqual({ text: 'Just chatting.', toolCall: null, usage: null });
    });

    it('maps assistant tool-call turns and tool-result turns into Anthropic content blocks', async () => {
      (global.fetch as jest.Mock).mockResolvedValue(
        jsonResponse({ content: [{ type: 'text', text: 'ok' }] }),
      );
      const history: AgentMessage[] = [
        { role: 'user', content: 'search please' },
        { role: 'assistant', content: '', toolCall: { id: 'tu_1', name: 'search', input: { q: 'x' } } },
        { role: 'tool', toolCallId: 'tu_1', name: 'search', content: 'result text' },
      ];
      await client.runAgentStep('sys', history, [TOOL], { feature: 'test' });
      const [, init] = (global.fetch as jest.Mock).mock.calls[0];
      const body = JSON.parse(init.body);
      expect(body.messages[1].content[0]).toMatchObject({ type: 'tool_use', id: 'tu_1' });
      expect(body.messages[2].content[0]).toMatchObject({ type: 'tool_result', tool_use_id: 'tu_1' });
    });

    it('rejects with AiUnavailableException and logs the failure when the API call fails', async () => {
      (global.fetch as jest.Mock).mockResolvedValue(jsonResponse({}, false));
      await expect(
        client.runAgentStep('sys', [{ role: 'user', content: 'hi' }], [], { feature: 'test' }),
      ).rejects.toThrow(AiUnavailableException);
      expect(observability.record).toHaveBeenCalledWith(
        expect.objectContaining({ feature: 'test', success: false }),
      );
    });

    it('streamAgentStep yields text deltas then a done event with the accumulated tool call', async () => {
      (global.fetch as jest.Mock).mockResolvedValue(
        sseResponse([
          JSON.stringify({ type: 'message_start', message: { usage: { input_tokens: 20 } } }),
          JSON.stringify({ type: 'content_block_start', content_block: { type: 'text' } }),
          JSON.stringify({ type: 'content_block_delta', delta: { type: 'text_delta', text: 'Hel' } }),
          JSON.stringify({ type: 'content_block_delta', delta: { type: 'text_delta', text: 'lo' } }),
          JSON.stringify({ type: 'content_block_stop' }),
          JSON.stringify({
            type: 'content_block_start',
            content_block: { type: 'tool_use', id: 'tu_2', name: 'pick_one' },
          }),
          JSON.stringify({ type: 'content_block_delta', delta: { type: 'input_json_delta', partial_json: '{"value"' } }),
          JSON.stringify({ type: 'content_block_delta', delta: { type: 'input_json_delta', partial_json: ':"x"}' } }),
          JSON.stringify({ type: 'content_block_stop' }),
          JSON.stringify({ type: 'message_delta', usage: { output_tokens: 7 } }),
          JSON.stringify({ type: 'message_stop' }),
        ]),
      );

      const events: any[] = [];
      for await (const event of client.streamAgentStep('sys', [{ role: 'user', content: 'hi' }], [TOOL], {
        feature: 'test',
      })) {
        events.push(event);
      }
      const textEvents = events.filter((e) => e.type === 'text');
      const done = events[events.length - 1];
      expect(textEvents.map((e) => e.delta).join('')).toBe('Hello');
      expect(done).toEqual({
        type: 'done',
        result: {
          text: 'Hello',
          toolCall: { id: 'tu_2', name: 'pick_one', input: { value: 'x' } },
          usage: { inputTokens: 20, outputTokens: 7 },
        },
      });
      expect(observability.record).toHaveBeenCalledWith(
        expect.objectContaining({ feature: 'test', inputTokens: 20, outputTokens: 7 }),
      );
    });
  });

  describe('openai-compatible provider', () => {
    beforeEach(() => {
      process.env.AI_PROVIDER = 'openai';
      process.env.AI_BASE_URL = 'https://api.groq.com/openai/v1';
      process.env.AI_MODEL = 'llama-3.3-70b-versatile';
    });

    it('sends function tool_choice and parses a tool_calls response', async () => {
      (global.fetch as jest.Mock).mockResolvedValue(
        jsonResponse({
          choices: [
            {
              message: {
                content: null,
                tool_calls: [
                  { id: 'call_1', function: { name: 'pick_one', arguments: '{"value":"x"}' } },
                ],
              },
            },
          ],
          usage: { prompt_tokens: 15, completion_tokens: 4 },
        }),
      );

      const result = await client.runAgentStep(
        'sys',
        [{ role: 'user', content: 'pick' }],
        [TOOL],
        { forceTool: 'pick_one', feature: 'test' },
      );
      expect(result.toolCall).toEqual({ id: 'call_1', name: 'pick_one', input: { value: 'x' } });
      expect(result.usage).toEqual({ inputTokens: 15, outputTokens: 4 });

      const [url, init] = (global.fetch as jest.Mock).mock.calls[0];
      expect(url).toBe('https://api.groq.com/openai/v1/chat/completions');
      const body = JSON.parse(init.body);
      expect(body.tool_choice).toEqual({ type: 'function', function: { name: 'pick_one' } });
    });

    it('streamAgentStep accumulates streamed tool_calls deltas and final usage', async () => {
      (global.fetch as jest.Mock).mockResolvedValue(
        sseResponse([
          JSON.stringify({ choices: [{ delta: { content: 'Hi ' } }] }),
          JSON.stringify({
            choices: [{ delta: { tool_calls: [{ index: 0, id: 'call_9', function: { name: 'pick_one', arguments: '' } }] } }],
          }),
          JSON.stringify({
            choices: [{ delta: { tool_calls: [{ index: 0, function: { arguments: '{"value":' } }] } }],
          }),
          JSON.stringify({
            choices: [{ delta: { tool_calls: [{ index: 0, function: { arguments: '"y"}' } }] } }],
          }),
          JSON.stringify({ choices: [], usage: { prompt_tokens: 9, completion_tokens: 3 } }),
          '[DONE]',
        ]),
      );

      const events: any[] = [];
      for await (const event of client.streamAgentStep('sys', [{ role: 'user', content: 'hi' }], [TOOL], {
        feature: 'test',
      })) {
        events.push(event);
      }
      const done = events[events.length - 1];
      expect(done).toEqual({
        type: 'done',
        result: {
          text: 'Hi ',
          toolCall: { id: 'call_9', name: 'pick_one', input: { value: 'y' } },
          usage: { inputTokens: 9, outputTokens: 3 },
        },
      });
    });
  });
});
