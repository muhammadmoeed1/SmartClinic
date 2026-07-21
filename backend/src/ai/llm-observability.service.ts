import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { LlmCall } from '../entities';

export interface LlmCallLogEntry {
  feature: string;
  provider: string;
  model: string;
  promptVersion?: string;
  toolName?: string | null;
  latencyMs: number;
  inputTokens?: number | null;
  outputTokens?: number | null;
  success: boolean;
  errorMessage?: string;
}

export interface FeatureStats {
  feature: string;
  calls: number;
  successRate: number;
  avgLatencyMs: number;
  totalInputTokens: number;
  totalOutputTokens: number;
}

/**
 * Records one row per LLM completion call for cost/latency/reliability
 * observability — the basis of the admin dashboard and eval reports. Logging
 * failures never break the calling feature: this is instrumentation, not a
 * dependency any AI feature should fail on top of.
 */
@Injectable()
export class LlmObservabilityService {
  private logger = new Logger('LlmObservability');

  constructor(@InjectRepository(LlmCall) private calls: Repository<LlmCall>) {}

  async record(entry: LlmCallLogEntry): Promise<void> {
    try {
      await this.calls.save(
        this.calls.create({
          feature: entry.feature,
          provider: entry.provider,
          model: entry.model,
          promptVersion: entry.promptVersion ?? null,
          toolName: entry.toolName ?? null,
          latencyMs: entry.latencyMs,
          inputTokens: entry.inputTokens ?? null,
          outputTokens: entry.outputTokens ?? null,
          success: entry.success,
          errorMessage: entry.errorMessage ?? null,
        }),
      );
    } catch (err) {
      this.logger.warn(`Failed to record LLM call log: ${(err as Error).message}`);
    }
  }

  async statsByFeature(since?: Date): Promise<FeatureStats[]> {
    const qb = this.calls
      .createQueryBuilder('c')
      .select('c.feature', 'feature')
      .addSelect('COUNT(*)', 'calls')
      .addSelect('AVG(CASE WHEN c.success THEN 1.0 ELSE 0.0 END)', 'successRate')
      .addSelect('AVG(c."latencyMs")', 'avgLatencyMs')
      .addSelect('COALESCE(SUM(c."inputTokens"), 0)', 'totalInputTokens')
      .addSelect('COALESCE(SUM(c."outputTokens"), 0)', 'totalOutputTokens')
      .groupBy('c.feature');
    if (since) qb.where('c."createdAt" >= :since', { since });

    const rows = await qb.getRawMany();
    return rows.map((r) => ({
      feature: r.feature,
      calls: parseInt(r.calls, 10),
      successRate: Math.round(parseFloat(r.successRate) * 1000) / 1000,
      avgLatencyMs: Math.round(parseFloat(r.avgLatencyMs)),
      totalInputTokens: parseInt(r.totalInputTokens, 10),
      totalOutputTokens: parseInt(r.totalOutputTokens, 10),
    }));
  }
}
