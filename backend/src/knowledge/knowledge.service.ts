import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { createHash } from 'crypto';
import { EmbeddingService } from '../embedding/embedding.service';
import { vectorToSql } from '../embedding/vector-sql';
import { SessionStore } from '../common/session-store';

export interface KnowledgeHit {
  id: string;
  title: string;
  content: string;
  category: string;
  specialty: string | null;
  score: number;
}

export interface HistoryHit {
  id: string;
  assessment: string;
  createdAt: Date;
  score: number;
}

export interface CacheStats {
  hits: number;
  misses: number;
  hitRate: number;
}

// Knowledge base content changes rarely (only via re-seeding), so it can be
// cached long. Patient history changes whenever a new visit is finalized, so
// its cache window is short — reduces redundant embed+query calls for
// repeated lookups within a session without risking noticeably stale results.
const KNOWLEDGE_CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const HISTORY_CACHE_TTL_MS = 10 * 60 * 1000;

/**
 * Retrieval-augmented generation over two pgvector-backed sources:
 *  - a static knowledge base of clinic guidance chunks (specialty routing,
 *    triage red flags, documentation tips)
 *  - a patient's own past visit-record assessments
 * Both are searched by cosine distance (`<=>`) rather than plain keyword
 * match, so semantically similar (not just lexically similar) content ranks
 * highest. Returns [] rather than throwing when embeddings are unavailable —
 * callers treat RAG context as an enhancement, never a hard dependency.
 *
 * Results are cached (Redis-or-memory, see SessionStore) keyed by a hash of
 * the normalized query, cutting repeated embedding + DB round-trips for
 * identical lookups. Hit/miss counters are exposed via cacheStats for the
 * observability endpoint.
 */
@Injectable()
export class KnowledgeService {
  private cache = new SessionStore<unknown>('rag-cache');
  private hits = 0;
  private misses = 0;

  constructor(
    private embeddings: EmbeddingService,
    @InjectDataSource() private dataSource: DataSource,
  ) {}

  get cacheStats(): CacheStats {
    const total = this.hits + this.misses;
    return { hits: this.hits, misses: this.misses, hitRate: total ? this.hits / total : 0 };
  }

  async searchKnowledge(query: string, k = 3, category?: string): Promise<KnowledgeHit[]> {
    const cacheKey = this.hashKey('knowledge', query, k, category ?? '');
    const cached = await this.cache.get(cacheKey);
    if (cached) {
      this.hits++;
      return cached as KnowledgeHit[];
    }
    this.misses++;

    const vector = await this.embeddings.embed(query);
    if (!vector) return [];
    const vectorSql = vectorToSql(vector);

    const params: unknown[] = [vectorSql];
    let sql = `
      SELECT id, title, content, category, specialty,
             1 - (embedding <=> $1::vector) AS score
      FROM knowledge_chunks
      WHERE embedding IS NOT NULL`;
    if (category) {
      params.push(category);
      sql += ` AND category = $${params.length}`;
    }
    params.push(k);
    sql += ` ORDER BY embedding <=> $1::vector LIMIT $${params.length}`;

    const result = await this.dataSource.query(sql, params);
    await this.cache.set(cacheKey, result, KNOWLEDGE_CACHE_TTL_MS);
    return result;
  }

  async searchPatientHistory(patientId: string, query: string, k = 3): Promise<HistoryHit[]> {
    const cacheKey = this.hashKey('history', patientId, query, k);
    const cached = await this.cache.get(cacheKey);
    if (cached) {
      this.hits++;
      return cached as HistoryHit[];
    }
    this.misses++;

    const vector = await this.embeddings.embed(query);
    if (!vector) return [];
    const vectorSql = vectorToSql(vector);

    const result = await this.dataSource.query(
      `
      SELECT id, assessment, "createdAt",
             1 - (embedding <=> $1::vector) AS score
      FROM visit_records
      WHERE "patientId" = $2 AND embedding IS NOT NULL AND assessment <> ''
      ORDER BY embedding <=> $1::vector LIMIT $3`,
      [vectorSql, patientId, k],
    );
    await this.cache.set(cacheKey, result, HISTORY_CACHE_TTL_MS);
    return result;
  }

  private hashKey(...parts: Array<string | number>): string {
    return createHash('sha1').update(parts.join('|')).digest('hex');
  }
}
