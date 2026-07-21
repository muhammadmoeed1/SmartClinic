import { LlmObservabilityService } from '../src/ai/llm-observability.service';

describe('LlmObservabilityService', () => {
  const calls = {
    create: jest.fn((entry) => entry),
    save: jest.fn().mockResolvedValue(undefined),
    createQueryBuilder: jest.fn(),
  } as any;
  let service: LlmObservabilityService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new LlmObservabilityService(calls);
  });

  it('persists a successful call log', async () => {
    await service.record({
      feature: 'recommend',
      provider: 'openai',
      model: 'llama-3.3-70b-versatile',
      promptVersion: 'v1',
      toolName: 'recommend_specialty',
      latencyMs: 250,
      inputTokens: 100,
      outputTokens: 20,
      success: true,
    });
    expect(calls.create).toHaveBeenCalledWith(
      expect.objectContaining({ feature: 'recommend', success: true, latencyMs: 250 }),
    );
    expect(calls.save).toHaveBeenCalled();
  });

  it('swallows persistence errors rather than throwing (instrumentation must not break the caller)', async () => {
    calls.save.mockRejectedValueOnce(new Error('db down'));
    await expect(
      service.record({
        feature: 'recommend', provider: 'openai', model: 'x', latencyMs: 1, success: false,
      }),
    ).resolves.toBeUndefined();
  });

  it('aggregates stats by feature via the query builder', async () => {
    const qb = {
      select: jest.fn().mockReturnThis(),
      addSelect: jest.fn().mockReturnThis(),
      groupBy: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      getRawMany: jest.fn().mockResolvedValue([
        {
          feature: 'recommend', calls: '10', successRate: '0.9', avgLatencyMs: '312.5',
          totalInputTokens: '1000', totalOutputTokens: '200',
        },
      ]),
    };
    calls.createQueryBuilder.mockReturnValue(qb);

    const result = await service.statsByFeature();
    expect(result).toEqual([{
      feature: 'recommend', calls: 10, successRate: 0.9, avgLatencyMs: 313,
      totalInputTokens: 1000, totalOutputTokens: 200,
    }]);
  });
});
