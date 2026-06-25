import { asc, eq } from 'drizzle-orm';
import type { Database } from '../../../../infrastructure/database/client.js';
import {
  executiveSummaries,
  summaryArticles,
} from '../../../../infrastructure/database/schema.js';
import { ExecutiveSummary } from '../../domain/entities/ExecutiveSummary.js';
import type { SummaryRepository } from '../../domain/repositories/SummaryRepository.js';

export class DrizzleSummaryRepository implements SummaryRepository {
  constructor(private readonly db: Database) {}

  async save(summary: ExecutiveSummary): Promise<ExecutiveSummary> {
    return this.db.transaction(async (tx) => {
      // Idempotência por periodKey: se já existe, devolve o existente.
      const inserted = await tx
        .insert(executiveSummaries)
        .values({
          runId: summary.runId,
          periodKey: summary.periodKey,
          content: summary.content,
        })
        .onConflictDoNothing({ target: executiveSummaries.periodKey })
        .returning();

      const row =
        inserted[0] ??
        (
          await tx
            .select()
            .from(executiveSummaries)
            .where(eq(executiveSummaries.periodKey, summary.periodKey))
            .limit(1)
        )[0];

      if (!row) throw new Error('Falha ao persistir resumo executivo.');

      // Refs de artigos só na primeira criação (inserted preenchido).
      if (inserted[0] && summary.articleRefs.length > 0) {
        await tx
          .insert(summaryArticles)
          .values(
            summary.articleRefs.map((r) => ({
              summaryId: row.id,
              articleId: r.articleId,
              rank: r.rank,
            })),
          )
          .onConflictDoNothing();
      }

      return this.hydrate(tx, row);
    });
  }

  async findByPeriodKey(periodKey: string): Promise<ExecutiveSummary | null> {
    const rows = await this.db
      .select()
      .from(executiveSummaries)
      .where(eq(executiveSummaries.periodKey, periodKey))
      .limit(1);
    return rows[0] ? this.hydrate(this.db, rows[0]) : null;
  }

  async findById(id: string): Promise<ExecutiveSummary | null> {
    const rows = await this.db
      .select()
      .from(executiveSummaries)
      .where(eq(executiveSummaries.id, id))
      .limit(1);
    return rows[0] ? this.hydrate(this.db, rows[0]) : null;
  }

  private async hydrate(
    runner: Pick<Database, 'select'>,
    row: typeof executiveSummaries.$inferSelect,
  ): Promise<ExecutiveSummary> {
    const refs = await runner
      .select()
      .from(summaryArticles)
      .where(eq(summaryArticles.summaryId, row.id))
      .orderBy(asc(summaryArticles.rank));

    return new ExecutiveSummary({
      id: row.id,
      runId: row.runId,
      periodKey: row.periodKey,
      content: row.content,
      createdAt: row.createdAt,
      articleRefs: refs.map((r) => ({ articleId: r.articleId, rank: r.rank })),
    });
  }
}
