import { and, desc, eq, sql } from 'drizzle-orm';
import type { Database } from '../../infrastructure/database/client.js';
import { classifications, newsArticles } from '../../infrastructure/database/schema.js';

const SAO_PAULO = 'America/Sao_Paulo';

export interface NewsFeedFilter {
  date?: string; // YYYY-MM-DD (por published_at em BRT)
  category?: string; // categoria atribuída pelo LLM
  limit?: number;
}

export interface NewsFeedItem {
  id: string;
  title: string;
  summary: string | null;
  url: string;
  source: string;
  sourceType: string;
  publishedAt: string | null;
  // Campos da classificação vigente (podem ser null se ainda não classificada).
  impact: string | null;
  relevance: number | null;
  category: string | null;
  justification: string | null;
}

/**
 * Projeção de leitura (CQRS) para o dashboard "Radar de Notícias".
 * Junta cada notícia com sua classificação vigente (is_current). Usa o banco
 * diretamente por ser caminho de leitura puro, sem regra de domínio.
 */
export class NewsFeedQuery {
  constructor(private readonly db: Database) {}

  async list(filter: NewsFeedFilter): Promise<NewsFeedItem[]> {
    const conditions = [];
    if (filter.date) {
      conditions.push(
        sql`(${newsArticles.publishedAt} AT TIME ZONE ${SAO_PAULO})::date = ${filter.date}::date`,
      );
    }
    if (filter.category) {
      conditions.push(eq(classifications.category, filter.category));
    }

    const rows = await this.db
      .select({
        id: newsArticles.id,
        title: newsArticles.title,
        summary: newsArticles.summary,
        url: newsArticles.url,
        source: newsArticles.source,
        sourceType: newsArticles.sourceType,
        publishedAt: newsArticles.publishedAt,
        impact: classifications.impact,
        relevance: classifications.relevance,
        category: classifications.category,
        justification: classifications.justification,
      })
      .from(newsArticles)
      .leftJoin(
        classifications,
        and(
          eq(classifications.articleId, newsArticles.id),
          eq(classifications.isCurrent, true),
        ),
      )
      .where(conditions.length ? and(...conditions) : undefined)
      .orderBy(sql`${classifications.relevance} DESC NULLS LAST`, desc(newsArticles.publishedAt))
      .limit(filter.limit ?? 200);

    return rows.map((r) => ({
      ...r,
      publishedAt: r.publishedAt ? r.publishedAt.toISOString() : null,
    }));
  }

  /** Categorias distintas já atribuídas (para o filtro do dashboard). */
  async categories(): Promise<string[]> {
    const rows = await this.db
      .selectDistinct({ category: classifications.category })
      .from(classifications)
      .where(eq(classifications.isCurrent, true));
    return rows.map((r) => r.category).filter(Boolean).sort();
  }
}
