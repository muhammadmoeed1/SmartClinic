import { AiUnavailableException, AgentMessage, LlmClient, ToolSchema } from '../src/ai/llm.client';

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
  let client: LlmClient;

  beforeEach(() => {
    process.env.AI_API_KEY = 'test-key';
    client = new LlmClient();
    global.fetch = jest.fn();
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    jest.restoreAllMocks();
  });

  it('throws AiUnavailableException when no API key is configured', async () => {
    delete process.env.AI_API_KEY;
    client = new LlmClient();
    await expect(client.runAgentStep('sys', [{ role: 'user', content: 'hi' }])).rejects.toThrow(
      AiUnavailableException,
    );
  });

  describe('anthropic provider', () => {
    beforeEach(() => {
      process.env.AI_PROVIDER = 'anthropic';
      process.env.AI_MODEL = 'claude-sonnet-5';
    });

    it('sends tool_choice and parses a tool_use response', async () => {
      (global.fetch as jest.Mock).mockResolvedValue(
        jsonResponse({
          content: [
            { type: 'text', text: 'Sure, here you go.' },
            { type: 'tool_use', id: 'tu_1', name: 'pick_one', input: { value: 'x' } },
          ],
        }),
      );

      const history: AgentMessage[] = [{ role: 'user', content: 'pick something' }];
      const result = await client.runAgentStep('sys', history, [TOOL], { forceTool: 'pick_one' });

      expect(result.toolCall).toEqual({ id: 'tu_1', name: 'pick_one', input: { value: 'x' } });
      expect(result.text).toBe('Sure, here you go.');

      const [, init] = (global.fetch as jest.Mock).mock.calls[0];
      const body = JSON.parse(init.body);
      expect(body.tool_choice).toEqual({ type: 'tool', name: 'pick_one' });
      expect(body.tools[0]).toMatchObject({ name: 'pick_one', input_schema: TOOL.parameters });
    });

    it('returns plain text with no tool call when the model does not call one', async () => {
      (global.fetch as jest.Mock).mockResolvedValue(
        jsonResponse({ content: [{ type: 'text', text: 'Just chatting.' }] }),
      );
      const result = await client.runAgentStep('sys', [{ role: 'user', content: 'hi' }]);
      expect(result).toEqual({ text: 'Just chatting.', toolCall: null });
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
      await client.runAgentStep('sys', history, [TOOL]);
      const [, init] = (global.fetch as jest.Mock).mock.calls[0];
      const body = JSON.parse(init.body);
      expect(body.messages[1].content[0]).toMatchObject({ type: 'tool_use', id: 'tu_1' });
      expect(body.messages[2].content[0]).toMatchObject({ type: 'tool_result', tool_use_id: 'tu_1' });
    });

    it('rejects with AiUnavailableException when the API call fails', async () => {
      (global.fetch as jest.Mock).mockResolvedValue(jsonResponse({}, false));
      await expect(
        client.runAgentStep('sys', [{ role: 'user', content: 'hi' }]),
      ).rejects.toThrow(AiUnavailableException);
    });

    it('streamAgentStep yields text deltas then a done event with the accumulated tool call', async () => {
      (global.fetch as jest.Mock).mockResolvedValue(
        sseResponse([
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
          JSON.stringify({ type: 'message_stop' }),
        ]),
      );

      const events: any[] = [];
      for await (const event of client.streamAgentStep('sys', [{ role: 'user', content: 'hi' }], [TOOL])) {
        events.push(event);
      }
      const textEvents = events.filter((e) => e.type === 'text');
      const done = events[events.length - 1];
      expect(textEvents.map((e) => e.delta).join('')).toBe('Hello');
      expect(done).toEqual({
        type: 'done',
        result: { text: 'Hello', toolCall: { id: 'tu_2', name: 'pick_one', input: { value: 'x' } } },
      });
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
        }),
      );

      const result = await client.runAgentStep(
        'sys',
        [{ role: 'user', content: 'pick' }],
        [TOOL],
        { forceTool: 'pick_one' },
      );
      expect(result.toolCall).toEqual({ id: 'call_1', name: 'pick_one', input: { value: 'x' } });

      const [url, init] = (global.fetch as jest.Mock).mock.calls[0];
      expect(url).toBe('https://api.groq.com/openai/v1/chat/completions');
      const body = JSON.parse(init.body);
      expect(body.tool_choice).toEqual({ type: 'function', function: { name: 'pick_one' } });
    });

    it('streamAgentStep accumulates streamed tool_calls deltas', async () => {
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
          '[DONE]',
        ]),
      );

      const events: any[] = [];
      for await (const event of client.streamAgentStep('sys', [{ role: 'user', content: 'hi' }], [TOOL])) {
        events.push(event);
      }
      const done = events[events.length - 1];
      expect(done).toEqual({
        type: 'done',
        result: { text: 'Hi ', toolCall: { id: 'call_9', name: 'pick_one', input: { value: 'y' } } },
      });
    });
  });
});
