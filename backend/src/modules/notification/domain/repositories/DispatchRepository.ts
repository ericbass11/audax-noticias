import type { Dispatch } from '../entities/Dispatch.js';

export interface DispatchRepository {
  /** Cria os registros pendentes para um resumo (idempotente por summary+recipient). */
  ensurePending(summaryId: string, recipients: string[]): Promise<Dispatch[]>;

  findBySummaryId(summaryId: string): Promise<Dispatch[]>;

  save(dispatch: Dispatch): Promise<void>;
}
