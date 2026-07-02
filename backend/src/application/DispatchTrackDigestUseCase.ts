import type { ArticleRepository } from '../modules/collection/domain/repositories/ArticleRepository.js';
import { ExecutiveSummaryBuilder } from '../modules/classification/domain/services/ExecutiveSummaryBuilder.js';
import { ExecutiveSummary } from '../modules/notification/domain/entities/ExecutiveSummary.js';
import type { SummaryRepository } from '../modules/notification/domain/repositories/SummaryRepository.js';
import type { DispatchSummaryUseCase } from '../modules/notification/application/use-cases/DispatchSummaryUseCase.js';

export interface DispatchTrackDigestResult {
  summaryId?: string;
  sent: number;
  failed: number;
  skipped: number;
}

/**
 * DispatchTrackDigestUseCase — monta um digest simples de uma rota (ex.: mercado
 * FIDC), persiste como resumo (periodKey próprio) e dispara para um destinatário
 * SEPARADO no WhatsApp. É o "2º fluxo de mensagem".
 */
export class DispatchTrackDigestUseCase {
  private readonly builder = new ExecutiveSummaryBuilder();

  constructor(
    private readonly articleRepository: ArticleRepository,
    private readonly summaries: SummaryRepository,
    private readonly dispatch: DispatchSummaryUseCase,
  ) {}

  async execute(
    runId: string,
    periodKey: string,
    articleIds: string[],
    header: string,
    recipients: string[],
  ): Promise<DispatchTrackDigestResult> {
    if (articleIds.length === 0) return { sent: 0, failed: 0, skipped: 0 };

    const articles = await this.articleRepository.findByIds(articleIds);
    const items = articles
      .map((a) => ({ id: a.id!, title: a.title, url: a.url, publishedAt: a.publishedAt }))
      .sort((x, y) => (y.publishedAt?.getTime() ?? 0) - (x.publishedAt?.getTime() ?? 0));
    if (items.length === 0) return { sent: 0, failed: 0, skipped: 0 };

    const content = this.builder.buildTrackDigest(header, items);

    const persisted = await this.summaries.save(
      new ExecutiveSummary({
        runId,
        periodKey,
        content,
        articleRefs: items.map((it, i) => ({ articleId: it.id, rank: i + 1 })),
      }),
    );

    return this.dispatch.execute(persisted.id!, { recipients });
  }
}
