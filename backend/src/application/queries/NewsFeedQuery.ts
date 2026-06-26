import { and, desc, eq, sql } from 'drizzle-orm';
import type { Database } from '../../infrastructure/database/client.js';
import { articleAnalyses, classifications, newsArticles } from '../../infrastructure/database/schema.js';

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
  imageUrl: string | null;
  source: string;
  sourceType: string;
  publishedAt: string | null;
  // Campos da classificação vigente (podem ser null se ainda não classificada).
  impact: string | null;
  relevance: number | null;
  category: string | null;
  justification: string | null;
  /** true se a notícia já tem análise profunda (conteúdo do portal). */
  hasAnalysis: boolean;
}

/** Análise profunda (conteúdo do portal) anexada ao detalhe da notícia. */
export interface NewsAnalysis {
  executiveSummary: string;
  areas: Record<string, string>;
  actions: string[];
  sourceRead: boolean;
}

export interface NewsDetail extends NewsFeedItem {
  analysis: NewsAnalysis | null;
}

/**
 * Projeção de leitura (CQRS) para o dashboard "Radar de Notícias".
 * Junta cada notícia com sua classificação vigente (is_current). Usa o banco
 * diretamente por ser caminho de leitura puro, sem regra de domínio.
 */
export class NewsFeedQuery {
  constructor(private readonly db: Database) {}

  /** Detalhe de UMA notícia (artigo + classificação + análise) para o portal. */
  async detail(id: string): Promise<NewsDetail | null> {
    const [base] = await this.db
      .select({
        id: newsArticles.id,
        title: newsArticles.title,
        summary: newsArticles.summary,
        url: newsArticles.url,
        imageUrl: newsArticles.imageUrl,
        source: newsArticles.source,
        sourceType: newsArticles.sourceType,
        publishedAt: newsArticles.publishedAt,
        impact: classifications.impact,
        relevance: classifications.relevance,
        category: classifications.category,
        justification: classifications.justification,
        hasAnalysis: sql<boolean>`EXISTS (SELECT 1 FROM ${articleAnalyses} WHERE ${articleAnalyses.articleId} = ${newsArticles.id} AND ${articleAnalyses.isCurrent})`,
      })
      .from(newsArticles)
      .leftJoin(
        classifications,
        and(eq(classifications.articleId, newsArticles.id), eq(classifications.isCurrent, true)),
      )
      .where(eq(newsArticles.id, id))
      .limit(1);

    if (!base) return null;

    const [analysisRow] = await this.db
      .select()
      .from(articleAnalyses)
      .where(and(eq(articleAnalyses.articleId, id), eq(articleAnalyses.isCurrent, true)))
      .limit(1);

    return {
      ...base,
      publishedAt: base.publishedAt ? base.publishedAt.toISOString() : null,
      analysis: analysisRow
        ? {
            executiveSummary: analysisRow.executiveSummary,
            areas: (analysisRow.areas ?? {}) as Record<string, string>,
            actions: (analysisRow.actions ?? []) as string[],
            sourceRead: analysisRow.sourceRead,
          }
        : null,
    };
  }

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
        imageUrl: newsArticles.imageUrl,
        source: newsArticles.source,
        sourceType: newsArticles.sourceType,
        publishedAt: newsArticles.publishedAt,
        impact: classifications.impact,
        relevance: classifications.relevance,
        category: classifications.category,
        justification: classifications.justification,
        hasAnalysis: sql<boolean>`EXISTS (SELECT 1 FROM ${articleAnalyses} WHERE ${articleAnalyses.articleId} = ${newsArticles.id} AND ${articleAnalyses.isCurrent})`,
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
