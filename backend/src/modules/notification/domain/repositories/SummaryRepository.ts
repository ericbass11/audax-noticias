import type { ExecutiveSummary } from '../entities/ExecutiveSummary.js';

export interface SummaryRepository {
  /** Persiste o resumo + os refs de artigos. Idempotente por periodKey. */
  save(summary: ExecutiveSummary): Promise<ExecutiveSummary>;

  findByPeriodKey(periodKey: string): Promise<ExecutiveSummary | null>;

  findById(id: string): Promise<ExecutiveSummary | null>;
}
