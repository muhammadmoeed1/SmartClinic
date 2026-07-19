import { Injectable, Logger } from '@nestjs/common';

export const EMBEDDING_DIM = 384;
const MODEL_ID = 'Xenova/all-MiniLM-L6-v2';

type Extractor = (text: string, opts: { pooling: 'mean'; normalize: boolean }) => Promise<{ data: Float32Array }>;

/**
 * Local, in-process embedding inference (no external API, no cost) via
 * transformers.js running a quantized MiniLM ONNX model. Loaded lazily on the
 * first call so the app never pays the ~5-10s model-load cost unless a RAG
 * feature is actually used, and failures degrade to "RAG unavailable" rather
 * than crashing the request — consistent with this project's AI degradation
 * pattern (see LlmClient).
 */
@Injectable()
export class EmbeddingService {
  private logger = new Logger('Embeddings');
  private extractorPromise: Promise<Extractor> | null = null;

  private async getExtractor(): Promise<Extractor> {
    if (!this.extractorPromise) {
      this.extractorPromise = (async () => {
        const { pipeline } = await import('@xenova/transformers');
        return (await pipeline('feature-extraction', MODEL_ID, {
          quantized: true,
        })) as unknown as Extractor;
      })().catch((err) => {
        this.extractorPromise = null; // allow retrying on a later call
        throw err;
      });
    }
    return this.extractorPromise;
  }

  /** Returns a normalized 384-dim embedding, or null if the model is unavailable. */
  async embed(text: string): Promise<number[] | null> {
    try {
      const extractor = await this.getExtractor();
      const output = await extractor(text, { pooling: 'mean', normalize: true });
      return Array.from(output.data);
    } catch (err) {
      this.logger.warn(`Embedding failed — RAG features degraded: ${(err as Error).message}`);
      return null;
    }
  }
}
