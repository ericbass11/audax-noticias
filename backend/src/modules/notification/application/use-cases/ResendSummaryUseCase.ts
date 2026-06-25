import type { SummaryRepository } from '../../domain/repositories/SummaryRepository.js';
import { DispatchSummaryUseCase, type DispatchSummaryResult } from './DispatchSummaryUseCase.js';

/**
 * ResendSummaryUseCase — reenvio manual do resumo de um turno (endpoint).
 *
 * Localiza o resumo já persistido pelo periodKey e dispara de novo. Por
 * padrão completa os envios pendentes/falhos; com `force` reenvia a todos.
 */
export class ResendSummaryUseCase {
  constructor(
    private readonly summaryRepository: SummaryRepository,
    private readonly dispatchSummary: DispatchSummaryUseCase,
  ) {}

  async execute(periodKey: string, force = false): Promise<DispatchSummaryResult> {
    const summary = await this.summaryRepository.findByPeriodKey(periodKey);
    if (!summary?.id) {
      throw new Error(`Nenhum resumo encontrado para o período ${periodKey}.`);
    }
    return this.dispatchSummary.execute(summary.id, { force });
  }
}
