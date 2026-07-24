import type { CommodityQuote, CommodityQuotesFetcher } from '../modules/market/CommodityQuotesFetcher.js';
import type { WhatsAppGateway } from '../modules/notification/domain/WhatsAppGateway.js';

export interface DispatchCommodityQuotesResult {
  sent: number;
  failed: number;
  quotes: number;
}

/**
 * DispatchCommodityQuotesUseCase — 3º fluxo de WhatsApp: captura as cotações de
 * commodities (SOJA/MILHO/CAFÉ/BOI GORDO) e envia um "boletim" curto para os
 * destinatários. Snapshot fresco a cada disparo (não persiste histórico).
 */
export class DispatchCommodityQuotesUseCase {
  constructor(
    private readonly fetcher: CommodityQuotesFetcher,
    private readonly whatsapp: WhatsAppGateway,
    private readonly recipients: string[],
  ) {}

  async execute(recipientsOverride?: string[]): Promise<DispatchCommodityQuotesResult> {
    const recipients = recipientsOverride ?? this.recipients;
    if (recipients.length === 0) return { sent: 0, failed: 0, quotes: 0 };

    const quotes = await this.fetcher.fetch();
    if (quotes.length === 0) return { sent: 0, failed: 0, quotes: 0 };

    const text = this.buildMessage(quotes);
    let sent = 0;
    let failed = 0;
    for (const recipient of recipients) {
      try {
        await this.whatsapp.sendText(recipient, text);
        sent += 1;
      } catch (err) {
        console.error(`⚠️  Falha ao enviar cotações para ${recipient}:`, (err as Error).message);
        failed += 1;
      }
    }
    return { sent, failed, quotes: quotes.length };
  }

  private buildMessage(quotes: CommodityQuote[]): string {
    const date = quotes[0]?.date ?? '';
    const lines = quotes.map((q) => {
      const emoji = q.variation.startsWith('-')
        ? '🔴'
        : /^\+?0,00$/.test(q.variation)
          ? '⚪'
          : '🟢';
      const varStr = q.variation.startsWith('-') ? q.variation : `+${q.variation.replace('+', '')}`;
      return `${emoji} *${q.label}*: R$ ${q.value}/${q.unit} (${varStr}%)`;
    });
    const parts = ['*📊 Cotações Agro — CEPEA/ESALQ*'];
    if (date) parts.push(`🗓️ ${date}`);
    parts.push('', lines.join('\n'), '', '_Fonte: CEPEA/ESALQ. Variação diária._');
    return parts.join('\n');
  }
}
