/** pgvector's text input format for a raw value is a bracketed literal, e.g. "[0.1,0.2,...]". */
export function vectorToSql(embedding: number[]): string {
  return `[${embedding.join(',')}]`;
}
