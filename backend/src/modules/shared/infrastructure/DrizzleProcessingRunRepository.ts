import { eq } from 'drizzle-orm';
import type { Database } from '../../../infrastructure/database/client.js';
import { processingRuns } from '../../../infrastructure/database/schema.js';
import { ProcessingRun, type RunStatus, type TriggerType } from '../domain/ProcessingRun.js';
import type { ProcessingRunRepository } from '../domain/ProcessingRunRepository.js';

function toDomain(row: typeof processingRuns.$inferSelect): ProcessingRun {
  return new ProcessingRun({
    id: row.id,
    periodKey: row.periodKey,
    triggerType: row.triggerType as TriggerType,
    status: row.status as RunStatus,
    counts: row.counts ?? {},
    error: row.error,
    startedAt: row.startedAt,
    finishedAt: row.finishedAt,
  });
}

export class DrizzleProcessingRunRepository implements ProcessingRunRepository {
  constructor(private readonly db: Database) {}

  async findOrCreate(
    periodKey: string,
    triggerType: TriggerType,
  ): Promise<{ run: ProcessingRun; created: boolean }> {
    const inserted = await this.db
      .insert(processingRuns)
      .values({ periodKey, triggerType })
      .onConflictDoNothing({ target: processingRuns.periodKey })
      .returning();

    if (inserted[0]) return { run: toDomain(inserted[0]), created: true };

    const existing = await this.findByPeriodKey(periodKey);
    if (!existing) throw new Error(`Falha ao obter run para ${periodKey}.`);
    return { run: existing, created: false };
  }

  async update(run: ProcessingRun): Promise<void> {
    if (!run.id) throw new Error('ProcessingRun sem id.');
    await this.db
      .update(processingRuns)
      .set({
        status: run.status,
        counts: run.counts,
        error: run.error,
        finishedAt: run.status === 'running' ? null : new Date(),
      })
      .where(eq(processingRuns.id, run.id));
  }

  async findByPeriodKey(periodKey: string): Promise<ProcessingRun | null> {
    const rows = await this.db
      .select()
      .from(processingRuns)
      .where(eq(processingRuns.periodKey, periodKey))
      .limit(1);
    return rows[0] ? toDomain(rows[0]) : null;
  }
}
