export interface AuditLogEntry {
  articleId?: string | null;
  classificationId?: string | null;
  prompt: string;
  rawResponse?: string | null;
  model: string;
  latencyMs?: number | null;
  tokensInput?: number | null;
  tokensOutput?: number | null;
  tokensCacheRead?: number | null;
  tokensCacheWrite?: number | null;
  status: 'success' | 'parse_error' | 'error';
  errorMessage?: string | null;
}

/**
 * Porta de auditoria do LLM. Hoje grava em tabela; o AuditLogger
 * (infra) é o ponto preparado para também enviar a um Langfuse depois.
 */
export interface AuditLogRepository {
  save(entry: AuditLogEntry): Promise<void>;
}
