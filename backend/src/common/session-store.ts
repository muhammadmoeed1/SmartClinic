import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import Redis from 'ioredis';

/**
 * Generic keyed store for short-lived values with a TTL — used both for
 * agent conversation state (e.g. the intake chatbot's message history) and,
 * with a different namespace, as a cache (e.g. KnowledgeService's RAG
 * search cache). Uses Redis when REDIS_URL is configured — required once
 * the backend runs as more than one instance, since state must survive being
 * served by a different instance on the next request. Falls back to an
 * in-process Map for local/single-instance use, consistent with this
 * project's AI degradation philosophy (see LlmClient).
 */
@Injectable()
export class SessionStore<T = unknown> implements OnModuleDestroy {
  private logger = new Logger('SessionStore');
  private redis: Redis | null = null;
  private memory = new Map<string, { value: T; expiresAt: number }>();

  constructor(private namespace: string = 'session') {
    const url = process.env.REDIS_URL;
    if (url) {
      this.redis = new Redis(url, { maxRetriesPerRequest: 2 });
      this.redis.on('error', (err) => this.logger.warn(`Redis error: ${err.message}`));
    }
  }

  get backend(): 'redis' | 'memory' {
    return this.redis ? 'redis' : 'memory';
  }

  async set(id: string, value: T, ttlMs: number): Promise<void> {
    if (this.redis) {
      await this.redis.set(this.key(id), JSON.stringify(value), 'PX', ttlMs);
      return;
    }
    this.memory.set(id, { value, expiresAt: Date.now() + ttlMs });
  }

  async get(id: string): Promise<T | null> {
    if (this.redis) {
      const raw = await this.redis.get(this.key(id));
      return raw ? (JSON.parse(raw) as T) : null;
    }
    const entry = this.memory.get(id);
    if (!entry) return null;
    if (Date.now() > entry.expiresAt) {
      this.memory.delete(id);
      return null;
    }
    return entry.value;
  }

  async delete(id: string): Promise<void> {
    if (this.redis) {
      await this.redis.del(this.key(id));
      return;
    }
    this.memory.delete(id);
  }

  private key(id: string): string {
    return `smartclinic:${this.namespace}:${id}`;
  }

  onModuleDestroy(): void {
    this.redis?.disconnect();
  }
}
