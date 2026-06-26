import { Article } from '../../domain/entities/Article.js';
import type { SourceType } from '../../domain/value-objects/ArticleSource.js';
import type { NewsArticleRow } from '../../../../infrastructure/database/schema.js';

/** Traduz entre a linha do banco (Drizzle) e a entidade de domínio. */
export const ArticleMapper = {
  toDomain(row: NewsArticleRow): Article {
    return Article.rehydrate({
      id: row.id,
      title: row.title,
      summary: row.summary,
      url: row.url,
      source: row.source,
      sourceType: row.sourceType as SourceType,
      rawCategory: row.rawCategory,
      publishedAt: row.publishedAt,
      imageUrl: row.imageUrl,
      contentHash: row.contentHash,
      collectedAt: row.collectedAt,
      runId: row.runId,
    });
  },

  toInsert(article: Article) {
    return {
      contentHash: article.contentHash,
      title: article.title,
      summary: article.summary,
      url: article.url,
      source: article.source,
      sourceType: article.sourceType,
      rawCategory: article.rawCategory,
      publishedAt: article.publishedAt,
      imageUrl: article.imageUrl,
      runId: article.runId ?? null,
    };
  },
};
