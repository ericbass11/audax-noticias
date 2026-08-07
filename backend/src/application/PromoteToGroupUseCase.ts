import type { DispatchSummaryUseCase } from '../modules/notification/application/use-cases/DispatchSummaryUseCase.js';
import type { SummaryRepository } from '../modules/notification/domain/repositories/SummaryRepository.js';
import type { DispatchCommodityQuotesUseCase } from './DispatchCommodityQuotesUseCase.js';

export interface PromoteToGroupResult {
  periodKey: string;
  promoted: { news: boolean; fidc: boolean; commodities: number };
}

/**
 * PromoteToGroupUseCase — segunda fase do fluxo de PREVIEW.
 *
 * Depois que o ciclo enviou tudo para o número pessoal (validação), este caso
 * promove o MESMO conteúdo para o grupo real: reenvia os resumos já persistidos
 * (notícias `periodKey` e FIDC `periodKey:fidc`) aos destinatários do grupo e
 * reenvia o boletim de cotações. O bloco de desastres já está dentro do resumo
 * de notícias, então vai junto. Idempotente por (resumo, destinatário).
 */
export class PromoteToGroupUseCase {
  constructor(
    private readonly summaries: SummaryRepository,
    private readonly dispatch: DispatchSummaryUseCase,
    private readonly dispatchCommodityQuotes: DispatchCommodityQuotesUseCase,
    /** Destinatários reais (grupo) por fluxo. */
    private readonly newsRecipients: string[],
    private readonly fidcRecipients: string[],
    private readonly commoditiesRecipients: string[],
    /** Promover o digest de notícias? Espelha NEWS_DIGEST_ENABLED — sem isto a
     *  promoção reenviaria ao grupo justamente o que o ciclo não mandou. */
    private readonly newsDigestEnabled = true,
    /** Cotações só na promoção do ciclo da manhã (COMMODITIES_ONLY_MORNING). */
    private readonly commoditiesOnlyMorning = false,
  ) {}

  async execute(periodKey: string): Promise<PromoteToGroupResult> {
    const result: PromoteToGroupResult = {
      periodKey,
      promoted: { news: false, fidc: false, commodities: 0 },
    };

    // Notícias (inclui o bloco de risco climático).
    try {
      const news = this.newsDigestEnabled
        ? await this.summaries.findByPeriodKey(periodKey)
        : null;
      if (news?.id && this.newsRecipients.length > 0) {
        await this.dispatch.execute(news.id, { recipients: this.newsRecipients });
        result.promoted.news = true;
      }
    } catch (err) {
      console.error('⚠️  Promoção (notícias) falhou:', (err as Error).message);
    }

    // FIDC (digest próprio).
    try {
      const fidc = await this.summaries.findByPeriodKey(`${periodKey}:fidc`);
      if (fidc?.id && this.fidcRecipients.length > 0) {
        await this.dispatch.execute(fidc.id, { recipients: this.fidcRecipients });
        result.promoted.fidc = true;
      }
    } catch (err) {
      console.error('⚠️  Promoção (FIDC) falhou:', (err as Error).message);
    }

    // Cotações — snapshot fresco enviado ao grupo.
    try {
      const runQuotes = !this.commoditiesOnlyMorning || periodKey.endsWith(':morning');
      if (runQuotes && this.commoditiesRecipients.length > 0) {
        const r = await this.dispatchCommodityQuotes.execute(this.commoditiesRecipients);
        result.promoted.commodities = r.sent;
      }
    } catch (err) {
      console.error('⚠️  Promoção (cotações) falhou:', (err as Error).message);
    }

    return result;
  }
}
