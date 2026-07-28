import type {
  CostReport,
  CostReportOptions,
  MetricsRepository,
} from '../domain/MetricsRepository.js';

/**
 * Monta o relatório de custo/tokens do LLM para o dashboard de custos.
 * Caminho de leitura puro: delega a agregação ao MetricsRepository.
 */
export class GetCostReportUseCase {
  constructor(private readonly metrics: MetricsRepository) {}

  async execute(opts?: CostReportOptions): Promise<CostReport> {
    return this.metrics.getCostReport(opts);
  }
}
