import type { Database } from '../../../../infrastructure/database/client.js';
import { llmAuditLogs } from '../../../../infrastructure/database/schema.js';
import type {
  AuditLogEntry,
  AuditLogRepository,
} from '../../domain/repositories/AuditLogRepository.js';

export class DrizzleAuditRepository implements AuditLogRepository {
  constructor(private readonly db: Database) {}

  async save(entry: AuditLogEntry): Promise<void> {
    await this.db.insert(llmAuditLogs).values({
      articleId: entry.articleId ?? null,
      classificationId: entry.classificationId ?? null,
      prompt: entry.prompt,
      rawResponse: entry.rawResponse ?? null,
      model: entry.model,
      latencyMs: entry.latencyMs ?? null,
      tokensInput: entry.tokensInput ?? null,
      tokensOutput: entry.tokensOutput ?? null,
      status: entry.status,
      errorMessage: entry.errorMessage ?? null,
    });
  }
}
