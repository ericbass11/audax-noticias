import { and, eq, inArray } from 'drizzle-orm';
import type { Database } from '../../../../infrastructure/database/client.js';
import { classifications } from '../../../../infrastructure/database/schema.js';
import { Classification } from '../../domain/entities/Classification.js';
import type { ClassificationRepository } from '../../domain/repositories/ClassificationRepository.js';
import type { Impact } from '../../domain/value-objects/Impact.js';

function toDomain(row: typeof classifications.$inferSelect): Classification {
  return new Classification({
    id: row.id,
    articleId: row.articleId,
    impact: row.impact as Impact,
    relevance: row.relevance,
    category: row.category,
    justification: row.justification,
    model: row.model,
    promptVersion: row.promptVersion,
    isCurrent: row.isCurrent,
    createdAt: row.createdAt,
  });
}

export class DrizzleClassificationRepository implements ClassificationRepository {
  constructor(private readonly db: Database) {}

  async saveBatch(items: Classification[]): Promise<Classification[]> {
    if (items.length === 0) return [];
    const articleIds = [...new Set(items.map((c) => c.articleId))];

    return this.db.transaction(async (tx) => {
      // Versionamento: classificações anteriores desses artigos deixam de ser
      // a vigente, preservando o histórico para auditoria/reprocesso.
      await tx
        .update(classifications)
        .set({ isCurrent: false })
        .where(
          and(
            inArray(classifications.articleId, articleIds),
            eq(classifications.isCurrent, true),
          ),
        );

      const rows = await tx
        .insert(classifications)
        .values(
          items.map((c) => ({
            articleId: c.articleId,
            impact: c.impact,
            relevance: c.relevance,
            category: c.category,
            justification: c.justification,
            model: c.model,
            promptVersion: c.promptVersion,
            isCurrent: true,
          })),
        )
        .returning();

      return rows.map(toDomain);
    });
  }

  async findCurrentByArticleIds(articleIds: string[]): Promise<Map<string, Classification>> {
    if (articleIds.length === 0) return new Map();
    const rows = await this.db
      .select()
      .from(classifications)
      .where(
        and(
          inArray(classifications.articleId, articleIds),
          eq(classifications.isCurrent, true),
        ),
      );
    return new Map(rows.map((r) => [r.articleId, toDomain(r)]));
  }
}
