import { eq } from 'drizzle-orm';
import type { Database } from '../../../../infrastructure/database/client.js';
import { dispatches } from '../../../../infrastructure/database/schema.js';
import { Dispatch } from '../../domain/entities/Dispatch.js';
import type { DispatchRepository } from '../../domain/repositories/DispatchRepository.js';
import type { DispatchStatus } from '../../domain/entities/Dispatch.js';

function toDomain(row: typeof dispatches.$inferSelect): Dispatch {
  return new Dispatch({
    id: row.id,
    summaryId: row.summaryId,
    recipient: row.recipient,
    status: row.status as DispatchStatus,
    providerMessageId: row.providerMessageId,
    attempts: row.attempts,
    errorMessage: row.errorMessage,
    sentAt: row.sentAt,
  });
}

export class DrizzleDispatchRepository implements DispatchRepository {
  constructor(private readonly db: Database) {}

  async ensurePending(summaryId: string, recipients: string[]): Promise<Dispatch[]> {
    if (recipients.length > 0) {
      // unique(summary_id, recipient) garante que reexecutar não duplica.
      await this.db
        .insert(dispatches)
        .values(recipients.map((recipient) => ({ summaryId, recipient })))
        .onConflictDoNothing({
          target: [dispatches.summaryId, dispatches.recipient],
        });
    }
    // SÓ as linhas dos destinatários PEDIDOS. Devolver todas as linhas do
    // resumo fazia um reenvio (ainda mais com `force`) reabrir envios para
    // destinatários de configurações antigas — foi assim que um digest saiu
    // para um grupo que já não estava em EVOLUTION_RECIPIENTS.
    const wanted = new Set(recipients);
    const all = await this.findBySummaryId(summaryId);
    return all.filter((d) => wanted.has(d.recipient));
  }

  async findBySummaryId(summaryId: string): Promise<Dispatch[]> {
    const rows = await this.db
      .select()
      .from(dispatches)
      .where(eq(dispatches.summaryId, summaryId));
    return rows.map(toDomain);
  }

  async save(dispatch: Dispatch): Promise<void> {
    if (!dispatch.id) throw new Error('Dispatch sem id não pode ser salvo.');
    await this.db
      .update(dispatches)
      .set({
        status: dispatch.status,
        providerMessageId: dispatch.providerMessageId,
        attempts: dispatch.attempts,
        errorMessage: dispatch.errorMessage,
        sentAt: dispatch.sentAt,
      })
      .where(eq(dispatches.id, dispatch.id));
  }
}
