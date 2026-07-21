import { MigrationInterface, QueryRunner } from 'typeorm';

/** LLM observability: one row per completion call (recommend, SOAP, intake
 * turns), capturing provider/model/prompt-version, latency, token usage, and
 * outcome — the basis for the admin observability endpoint and eval reports. */
export class LlmCalls1720000000003 implements MigrationInterface {
  name = 'LlmCalls1720000000003';

  public async up(q: QueryRunner): Promise<void> {
    await q.query(`
      CREATE TABLE "llm_calls" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "feature" varchar NOT NULL,
        "provider" varchar NOT NULL,
        "model" varchar NOT NULL,
        "promptVersion" varchar,
        "toolName" varchar,
        "latencyMs" integer NOT NULL,
        "inputTokens" integer,
        "outputTokens" integer,
        "success" boolean NOT NULL,
        "errorMessage" text,
        "createdAt" timestamptz NOT NULL DEFAULT now()
      )`);
    await q.query(`CREATE INDEX "llm_calls_feature_idx" ON "llm_calls" ("feature")`);
    await q.query(`CREATE INDEX "llm_calls_created_at_idx" ON "llm_calls" ("createdAt")`);
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(`DROP TABLE IF EXISTS "llm_calls"`);
  }
}
