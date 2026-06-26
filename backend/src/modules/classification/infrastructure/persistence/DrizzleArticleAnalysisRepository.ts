import { and, eq, inArray } from 'drizzle-orm';
import type { Database } from '../../../../infrastructure/database/client.js';
import { articleAnalyses } from '../../../../infrastructure/database/schema.js';
import {
  ArticleAnalysis,
  type ArticleAnalysisAreas,
} from '../../domain/entities/ArticleAnalysis.js';
import type { ArticleAnalysisRepository } from '../../domain/repositories/ArticleAnalysisRepository.js';

function toDomain(row: typeof articleAnalyses.$inferSelect): ArticleAnalysis {
  return new ArticleAnalysis({
    id: row.id,
    articleId: row.articleId,
    sourceRead: row.sourceRead,
    sourceChars: row.sourceChars,
    sourceText: row.sourceText,
    executiveSummary: row.executiveSummary,
    areas: (row.areas ?? {}) as ArticleAnalysisAreas,
    actions: (row.actions ?? []) as string[],
    model: row.model,
    promptVersion: row.promptVersion,
    isCurrent: row.isCurrent,
    createdAt: row.createdAt,
  });
}

export class DrizzleArticleAnalysisRepository implements ArticleAnalysisRepository {
  constructor(private readonly db: Database) {}

  async saveCurrent(analysis: ArticleAnalysis): Promise<ArticleAnalysis> {
    return this.db.transaction(async (tx) => {
      // Versionamento: análises anteriores deixam de ser a vigente.
      await tx
        .update(articleAnalyses)
        .set({ isCurrent: false })
        .where(
          and(
            eq(articleAnalyses.articleId, analysis.articleId),
            eq(articleAnalyses.isCurrent, true),
          ),
        );

      const [row] = await tx
        .insert(articleAnalyses)
        .values({
          articleId: analysis.articleId,
          sourceRead: analysis.sourceRead,
          sourceChars: analysis.sourceChars,
          sourceText: analysis.sourceText,
          executiveSummary: analysis.executiveSummary,
          areas: analysis.areas as Record<string, string>,
          actions: analysis.actions,
          model: analysis.model,
          promptVersion: analysis.promptVersion,
          isCurrent: true,
        })
        .returning();

      return toDomain(row!);
    });
  }

  async findCurrentByArticleId(articleId: string): Promise<ArticleAnalysis | null> {
    const rows = await this.db
      .select()
      .from(articleAnalyses)
      .where(
        and(eq(articleAnalyses.articleId, articleId), eq(articleAnalyses.isCurrent, true)),
      );
    return rows[0] ? toDomain(rows[0]) : null;
  }

  async findCurrentByArticleIds(articleIds: string[]): Promise<Map<string, ArticleAnalysis>> {
    if (articleIds.length === 0) return new Map();
    const rows = await this.db
      .select()
      .from(articleAnalyses)
      .where(
        and(
          inArray(articleAnalyses.articleId, articleIds),
          eq(articleAnalyses.isCurrent, true),
        ),
      );
    return new Map(rows.map((r) => [r.articleId, toDomain(r)]));
  }
}
