import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { EmbeddingService } from '../embedding/embedding.service';
import { vectorToSql } from '../embedding/vector-sql';

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

/**
 * Retrieval-augmented generation over two pgvector-backed sources:
 *  - a static knowledge base of clinic guidance chunks (specialty routing,
 *    triage red flags, documentation tips)
 *  - a patient's own past visit-record assessments
 * Both are searched by cosine distance (`<=>`) rather than plain keyword
 * match, so semantically similar (not just lexically similar) content ranks
 * highest. Returns [] rather than throwing when embeddings are unavailable —
 * callers treat RAG context as an enhancement, never a hard dependency.
 */
@Injectable()
export class KnowledgeService {
  constructor(
    private embeddings: EmbeddingService,
    @InjectDataSource() private dataSource: DataSource,
  ) {}

  async searchKnowledge(query: string, k = 3, category?: string): Promise<KnowledgeHit[]> {
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

    return this.dataSource.query(sql, params);
  }

  async searchPatientHistory(patientId: string, query: string, k = 3): Promise<HistoryHit[]> {
    const vector = await this.embeddings.embed(query);
    if (!vector) return [];
    const vectorSql = vectorToSql(vector);

    return this.dataSource.query(
      `
      SELECT id, assessment, "createdAt",
             1 - (embedding <=> $1::vector) AS score
      FROM visit_records
      WHERE "patientId" = $2 AND embedding IS NOT NULL AND assessment <> ''
      ORDER BY embedding <=> $1::vector LIMIT $3`,
      [vectorSql, patientId, k],
    );
  }
}
