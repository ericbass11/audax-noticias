import type { NormalizedArticleInput } from '../../domain/entities/Article.js';

/**
 * Porta para qualquer fonte de notícias. Cada implementação (GNews, RSS,
 * futuramente NewsData.io) é responsável por buscar e NORMALIZAR para o
 * schema único `NormalizedArticleInput`. Trocar de provedor de API significa
 * apenas trocar a implementação — o resto do pipeline não muda.
 */
export interface NewsSource {
  readonly name: string;
  fetch(): Promise<NormalizedArticleInput[]>;
}
