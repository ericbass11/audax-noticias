import type { DispatchRepository } from '../../domain/repositories/DispatchRepository.js';
import type { SummaryRepository } from '../../domain/repositories/SummaryRepository.js';
import type { WhatsAppGateway } from '../../domain/WhatsAppGateway.js';

export interface DispatchSummaryResult {
  summaryId: string;
  sent: number;
  failed: number;
  skipped: number; // já enviados anteriormente (idempotência)
}

/**
 * DispatchSummaryUseCase — envia o resumo já persistido aos destinatários.
 *
 * Regras:
 * - O resumo PRECISA já estar salvo (este use case só dispara).
 * - Idempotente: destinatários com status 'sent' são pulados, salvo `force`.
 * - Uma falha de envio a um destinatário não impede os demais; o erro fica
 *   registrado no Dispatch para reenvio posterior.
 */
export class DispatchSummaryUseCase {
  constructor(
    private readonly summaryRepository: SummaryRepository,
    private readonly dispatchRepository: DispatchRepository,
    private readonly whatsapp: WhatsAppGateway,
    private readonly defaultRecipients: string[],
    private readonly now: () => Date = () => new Date(),
  ) {}

  async execute(
    summaryId: string,
    options: { recipients?: string[]; force?: boolean } = {},
  ): Promise<DispatchSummaryResult> {
    const summary = await this.summaryRepository.findById(summaryId);
    if (!summary) throw new Error(`Resumo ${summaryId} não encontrado.`);

    const recipients = options.recipients ?? this.defaultRecipients;
    const dispatchesToSend = await this.dispatchRepository.ensurePending(summaryId, recipients);

    let sent = 0;
    let failed = 0;
    let skipped = 0;

    for (const dispatch of dispatchesToSend) {
      if (dispatch.status === 'sent' && !options.force) {
        skipped += 1;
        continue;
      }
      try {
        const result = await this.whatsapp.sendText(dispatch.recipient, summary.content);
        dispatch.markSent(result.providerMessageId, this.now());
        sent += 1;
      } catch (err) {
        dispatch.markFailed((err as Error).message);
        failed += 1;
      }
      await this.dispatchRepository.save(dispatch);
    }

    return { summaryId, sent, failed, skipped };
  }
}
