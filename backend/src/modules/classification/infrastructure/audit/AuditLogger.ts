import type {
  AuditLogEntry,
  AuditLogRepository,
} from '../../domain/repositories/AuditLogRepository.js';

export interface LangfuseConfig {
  enabled: boolean;
  publicKey: string;
  secretKey: string;
  baseUrl: string;
}

/**
 * AuditLogger — registra cada interação com o LLM (prompt, resposta, latência,
 * tokens, status). Hoje persiste em tabela via AuditLogRepository.
 *
 * HOOK LANGFUSE: `forwardToLangfuse` é o ponto preparado para enviar o mesmo
 * trace a um Langfuse no futuro. Hoje é um no-op quando LANGFUSE_ENABLED=false.
 * Para integrar: instalar `langfuse`, instanciar com as chaves e mapear o
 * entry para um trace/generation aqui — sem tocar no resto do pipeline.
 */
export class AuditLogger {
  constructor(
    private readonly repository: AuditLogRepository,
    private readonly langfuse: LangfuseConfig,
  ) {}

  async record(entry: AuditLogEntry): Promise<void> {
    // Auditoria nunca deve derrubar o fluxo principal.
    try {
      await this.repository.save(entry);
    } catch (err) {
      console.error('⚠️  Falha ao gravar audit log:', (err as Error).message);
    }
    await this.forwardToLangfuse(entry);
  }

  private async forwardToLangfuse(entry: AuditLogEntry): Promise<void> {
    if (!this.langfuse.enabled) return;
    // TODO(Langfuse): mapear `entry` para um trace/generation e enviar.
    // Mantido como hook explícito para integração futura sem refatorar.
    void entry;
  }
}
