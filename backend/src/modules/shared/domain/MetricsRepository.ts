/**
 * Read-model de custo/tokens do LLM (dashboard de custos do portal).
 *
 * Projeção de leitura pura sobre `llm_audit_logs` + `processing_runs`. Como
 * a auditoria não tem `run_id`, a atribuição por ciclo é feita por TEMPO:
 * uma linha pertence ao run cujo intervalo [startedAt, finishedAt|now] contém
 * o `createdAt`. Os ciclos NÃO se sobrepõem (worker concurrency=1).
 */
export interface CostTotals {
  calls: number;
  tokensInput: number;
  tokensOutput: number;
  tokensCacheRead: number;
  tokensCacheWrite: number;
  usd: number;
}

export interface DailyCost {
  day: string; // YYYY-MM-DD (fuso America/Sao_Paulo)
  calls: number;
  tokensInput: number;
  tokensOutput: number;
  usd: number;
}

export interface ModelCost {
  calls: number;
  tokensInput: number;
  tokensOutput: number;
  usd: number;
}

export interface CycleCost {
  periodKey: string;
  startedAt: string;
  finishedAt: string | null;
  status: string;
  calls: number;
  tokensInput: number;
  tokensOutput: number;
  tokensCacheRead: number;
  tokensCacheWrite: number;
  usd: number;
  byModel: Record<string, ModelCost>;
}

export interface CostReport {
  totals: CostTotals;
  daily: DailyCost[];
  cycles: CycleCost[];
}

export interface CostReportOptions {
  /** Nº de ciclos (processing_runs) mais recentes. Padrão 30. */
  cycles?: number;
  /** Janela em dias para totais/diário. Padrão 30. */
  days?: number;
}

export interface MetricsRepository {
  getCostReport(opts?: CostReportOptions): Promise<CostReport>;
}
