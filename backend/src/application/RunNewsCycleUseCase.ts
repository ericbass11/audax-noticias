import type { CollectNewsUseCase } from '../modules/collection/application/use-cases/CollectNewsUseCase.js';
import type { ClassifyArticlesUseCase } from '../modules/classification/application/use-cases/ClassifyArticlesUseCase.js';
import type { GenerateSummaryUseCase } from '../modules/classification/application/use-cases/GenerateSummaryUseCase.js';
import type { DispatchSummaryUseCase } from '../modules/notification/application/use-cases/DispatchSummaryUseCase.js';
import { ExecutiveSummary } from '../modules/notification/domain/entities/ExecutiveSummary.js';
import type { SummaryRepository } from '../modules/notification/domain/repositories/SummaryRepository.js';
import type { ProcessingRunRepository } from '../modules/shared/domain/ProcessingRunRepository.js';
import type { TriggerType } from '../modules/shared/domain/ProcessingRun.js';

export interface RunNewsCycleInput {
  periodKey: string;
  triggerType: TriggerType;
  /** Reexecuta mesmo que o turno já tenha sido concluído. */
  force?: boolean;
}

export interface RunNewsCycleResult {
  periodKey: string;
  status: 'completed' | 'skipped' | 'failed';
  collected?: number;
  deduped?: number;
  classified?: number;
  summaryId?: string;
  dispatch?: { sent: number; failed: number; skipped: number };
  reason?: string;
}

/**
 * RunNewsCycleUseCase — orquestração de aplicação (cross-módulo) de UM turno:
 *
 *   coleta → dedup → classificação (LLM) → resumo executivo → PERSISTE → disparo
 *
 * Idempotência: ancorada no ProcessingRun.periodKey. Se o turno já foi
 * concluído e `force` não foi pedido, não reprocessa. O disparo só ocorre
 * DEPOIS de persistir o resumo, e é idempotente por (summary, recipient).
 */
export class RunNewsCycleUseCase {
  constructor(
    private readonly runs: ProcessingRunRepository,
    private readonly collect: CollectNewsUseCase,
    private readonly classify: ClassifyArticlesUseCase,
    private readonly generateSummary: GenerateSummaryUseCase,
    private readonly summaries: SummaryRepository,
    private readonly dispatch: DispatchSummaryUseCase,
  ) {}

  async execute(input: RunNewsCycleInput): Promise<RunNewsCycleResult> {
    const { run, created } = await this.runs.findOrCreate(input.periodKey, input.triggerType);

    if (!created && run.status === 'completed' && !input.force) {
      return { periodKey: input.periodKey, status: 'skipped', reason: 'turno já concluído' };
    }

    try {
      // 1. Coleta + dedup + persistência das notícias novas.
      const collection = await this.collect.execute(run.id!);

      // 2. Classificação dos artigos novos (se houver).
      const classification = await this.classify.execute(collection.savedArticleIds);
      run.complete({
        collected: collection.collected,
        deduped: collection.deduped,
        classified: classification.classified,
      });

      // Sem notícias novas → conclui o turno sem resumo/disparo.
      if (collection.savedArticleIds.length === 0) {
        await this.runs.update(run);
        return {
          periodKey: input.periodKey,
          status: 'completed',
          collected: collection.collected,
          deduped: 0,
          classified: 0,
          reason: 'nenhuma notícia nova',
        };
      }

      // 3. Resumo executivo consolidado.
      const summary = await this.generateSummary.execute(collection.savedArticleIds);
      if (!summary) {
        await this.runs.update(run);
        return {
          periodKey: input.periodKey,
          status: 'completed',
          collected: collection.collected,
          deduped: collection.deduped,
          classified: classification.classified,
          reason: 'sem itens classificados para resumir',
        };
      }

      // 4. PERSISTE o resumo antes de qualquer envio (idempotente por periodKey).
      const persisted = await this.summaries.save(
        new ExecutiveSummary({
          runId: run.id!,
          periodKey: input.periodKey,
          content: summary.content,
          articleRefs: summary.rankedArticleIds.map((articleId, i) => ({
            articleId,
            rank: i + 1,
          })),
        }),
      );

      await this.runs.update(run);

      // 5. Só então dispara no WhatsApp.
      const dispatchResult = await this.dispatch.execute(persisted.id!);

      return {
        periodKey: input.periodKey,
        status: 'completed',
        collected: collection.collected,
        deduped: collection.deduped,
        classified: classification.classified,
        summaryId: persisted.id,
        dispatch: {
          sent: dispatchResult.sent,
          failed: dispatchResult.failed,
          skipped: dispatchResult.skipped,
        },
      };
    } catch (err) {
      run.fail((err as Error).message);
      await this.runs.update(run);
      return { periodKey: input.periodKey, status: 'failed', reason: (err as Error).message };
    }
  }
}
