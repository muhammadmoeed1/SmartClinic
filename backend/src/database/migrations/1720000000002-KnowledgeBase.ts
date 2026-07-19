import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * RAG foundation: a small knowledge base of clinic guidance chunks (specialty
 * routing, red-flag triage cues, documentation tips) plus per-visit-record
 * embeddings, both searched via pgvector cosine distance (<=>).
 */
export class KnowledgeBase1720000000002 implements MigrationInterface {
  name = 'KnowledgeBase1720000000002';

  public async up(q: QueryRunner): Promise<void> {
    await q.query(`
      CREATE TABLE "knowledge_chunks" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "category" varchar NOT NULL,
        "specialty" varchar,
        "title" varchar NOT NULL,
        "content" text NOT NULL,
        "embedding" vector(384),
        "createdAt" timestamptz NOT NULL DEFAULT now()
      )`);
    await q.query(`
      CREATE INDEX "knowledge_chunks_embedding_idx" ON "knowledge_chunks"
      USING hnsw ("embedding" vector_cosine_ops)`);

    await q.query(`ALTER TABLE "visit_records" ADD COLUMN "embedding" vector(384)`);
    await q.query(`
      CREATE INDEX "visit_records_embedding_idx" ON "visit_records"
      USING hnsw ("embedding" vector_cosine_ops)`);
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(`DROP INDEX IF EXISTS "visit_records_embedding_idx"`);
    await q.query(`ALTER TABLE "visit_records" DROP COLUMN IF EXISTS "embedding"`);
    await q.query(`DROP TABLE IF EXISTS "knowledge_chunks"`);
  }
}
