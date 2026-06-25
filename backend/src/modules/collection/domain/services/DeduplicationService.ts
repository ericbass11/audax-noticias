import type { Article } from '../entities/Article.js';

/**
 * DeduplicationService — serviço de domínio puro.
 *
 * Remove duplicatas DENTRO de um lote recém-coletado (mesmo hash vindo de
 * fontes diferentes na mesma rodada). A deduplicação contra o que já está
 * persistido é responsabilidade do repositório (findExistingHashes), pois
 * depende de I/O — aqui ficamos só com a regra in-memory.
 */
export class DeduplicationService {
  dedupeWithinBatch(articles: Article[]): Article[] {
    const seen = new Set<string>();
    const result: Article[] = [];
    for (const article of articles) {
      if (seen.has(article.contentHash)) continue;
      seen.add(article.contentHash);
      result.push(article);
    }
    return result;
  }
}
