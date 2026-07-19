/**
 * Embeds and loads the clinic knowledge base (specialty routing, triage red
 * flags, documentation tips) into knowledge_chunks for RAG retrieval.
 * Run with: npm run seed:knowledge   (idempotent — clears and reinserts)
 */
import 'reflect-metadata';
import { AppDataSource } from './data-source';
import { KNOWLEDGE_BASE } from './knowledge-base';
import { vectorToSql } from '../embedding/vector-sql';

async function main() {
  const ds = await AppDataSource.initialize();
  const { pipeline } = await import('@xenova/transformers');
  console.log('Loading embedding model (first run downloads ~25MB, cached after)...');
  const extractor = await pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2', {
    quantized: true,
  });

  await ds.query('DELETE FROM knowledge_chunks');

  for (const chunk of KNOWLEDGE_BASE) {
    const output: any = await extractor(`${chunk.title}. ${chunk.content}`, {
      pooling: 'mean',
      normalize: true,
    });
    const embedding = Array.from(output.data as Float32Array);
    await ds.query(
      `INSERT INTO knowledge_chunks (category, specialty, title, content, embedding)
       VALUES ($1, $2, $3, $4, $5::vector)`,
      [chunk.category, chunk.specialty, chunk.title, chunk.content, vectorToSql(embedding)],
    );
    console.log(`  embedded: ${chunk.title}`);
  }

  console.log(`Knowledge base seeded: ${KNOWLEDGE_BASE.length} chunks.`);
  await ds.destroy();
}

main().catch((err) => {
  console.error('seed-knowledge failed', err);
  process.exit(1);
});
