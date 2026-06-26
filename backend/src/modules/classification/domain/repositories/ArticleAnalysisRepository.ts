import type { ArticleAnalysis } from '../entities/ArticleAnalysis.js';

/**
 * Porta de persistência das análises profundas (conteúdo do portal).
 */
export interface ArticleAnalysisRepository {
  /** Salva como vigente: marca análises anteriores do artigo como não-atuais. */
  saveCurrent(analysis: ArticleAnalysis): Promise<ArticleAnalysis>;
  /** Análise vigente de um artigo (ou null). */
  findCurrentByArticleId(articleId: string): Promise<ArticleAnalysis | null>;
  /** Mapa articleId → análise vigente, para um conjunto de artigos. */
  findCurrentByArticleIds(articleIds: string[]): Promise<Map<string, ArticleAnalysis>>;
}
