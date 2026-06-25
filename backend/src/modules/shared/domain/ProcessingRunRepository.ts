import type { ProcessingRun } from './ProcessingRun.js';

export interface ProcessingRunRepository {
  /**
   * Cria um run para o período se ainda não existir. Se já existir (mesmo
   * periodKey), retorna { run, created: false } — base da idempotência:
   * o orquestrador decide não reprocessar um turno já concluído.
   */
  findOrCreate(periodKey: string, triggerType: ProcessingRun['triggerType']): Promise<{
    run: ProcessingRun;
    created: boolean;
  }>;

  update(run: ProcessingRun): Promise<void>;

  findByPeriodKey(periodKey: string): Promise<ProcessingRun | null>;
}
