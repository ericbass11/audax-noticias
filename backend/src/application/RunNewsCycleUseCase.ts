import type { CollectNewsUseCase } from '../modules/collection/application/use-cases/CollectNewsUseCase.js';
import type { TriageArticlesUseCase } from '../modules/classification/application/use-cases/TriageArticlesUseCase.js';
import type { ClassifyArticlesUseCase } from '../modules/classification/application/use-cases/ClassifyArticlesUseCase.js';
import type { GenerateArticleAnalysisUseCase } from '../modules/classification/application/use-cases/GenerateArticleAnalysisUseCase.js';
import type { DedupeWatchlistUseCase } from '../modules/classification/application/use-cases/DedupeWatchlistUseCase.js';
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
  triaged?: number;
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
    private readonly triage: TriageArticlesUseCase,
    private readonly classify: ClassifyArticlesUseCase,
    private readonly generateSummary: GenerateSummaryUseCase,
    private readonly analyze: GenerateArticleAnalysisUseCase,
    private readonly dedupeWatchlist: DedupeWatchlistUseCase,
    private readonly summaries: SummaryRepository,
    private readonly dispatch: DispatchSummaryUseCase,
    /** Incluir o bloco de alertas ANVISA no WhatsApp? (portal sempre recebe). */
    private readonly includeWatchlistInSummary = false,
  ) {}

  async execute(input: RunNewsCycleInput): Promise<RunNewsCycleResult> {
    const { run, created } = await this.runs.findOrCreate(input.periodKey, input.triggerType);

    if (!created && run.status === 'completed' && !input.force) {
      return { periodKey: input.periodKey, status: 'skipped', reason: 'turno já concluído' };
    }

    try {
      // 1. Coleta em duas trilhas: 'news' (janela curta) e 'watchlist' (ampla,
      // ex.: ANVISA).
      const collection = await this.collect.execute(run.id!);

      // Cura da watchlist: agrupa alertas do MESMO fato regulatório (mesma ação
      // ANVISA publicada por vários veículos) e mantém um por evento.
      let watchlistIds = collection.watchlistArticleIds;
      if (watchlistIds.length > 1) {
        try {
          watchlistIds = await this.dedupeWatchlist.execute(watchlistIds);
        } catch (err) {
          console.error('⚠️  Dedup da watchlist falhou:', (err as Error).message);
        }
      }

      // Nada novo em nenhuma trilha → conclui o turno.
      if (collection.savedArticleIds.length === 0 && watchlistIds.length === 0) {
        run.complete({ collected: collection.collected, deduped: 0, triaged: 0, classified: 0 });
        await this.runs.update(run);
        return {
          periodKey: input.periodKey,
          status: 'completed',
          collected: collection.collected,
          deduped: 0,
          triaged: 0,
          classified: 0,
          reason: 'nenhuma notícia nova',
        };
      }

      // 2. + 3. Triagem e classificação — só a trilha 'news'.
      let survivorIds: string[] = [];
      let classified = 0;
      if (collection.savedArticleIds.length > 0) {
        const triage = await this.triage.execute(collection.savedArticleIds);
        survivorIds = triage.survivorIds;
        classified = (await this.classify.execute(survivorIds)).classified;
      }
      run.complete({
        collected: collection.collected,
        deduped: collection.deduped,
        triaged: survivorIds.length,
        classified,
      });

      // 4. Vigilância (ANVISA): pula a triagem; análise focada em NFe/recebível.
      if (watchlistIds.length > 0) {
        try {
          await this.analyze.execute(watchlistIds, { watchlist: true });
        } catch (err) {
          console.error('⚠️  Falha na análise de vigilância (ANVISA):', (err as Error).message);
        }
      }

      // 5. Resumo executivo: notícias relevantes (+ bloco ANVISA só se o flag
      // estiver ligado). Os alertas seguem no portal independentemente.
      const summary = await this.generateSummary.execute(
        survivorIds,
        this.includeWatchlistInSummary ? watchlistIds : [],
      );
      if (!summary) {
        await this.runs.update(run);
        return {
          periodKey: input.periodKey,
          status: 'completed',
          collected: collection.collected,
          deduped: collection.deduped,
          triaged: survivorIds.length,
          classified,
          reason: 'sem itens acima do piso de relevância',
        };
      }

      // 6. Análise profunda das relevantes (portal). Tolerante a falha.
      try {
        await this.analyze.execute(summary.relevantArticleIds);
      } catch (err) {
        console.error('⚠️  Falha na análise profunda (portal):', (err as Error).message);
      }

      // 7. PERSISTE o resumo antes de qualquer envio (idempotente por periodKey).
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

      // 8. Só então dispara no WhatsApp.
      const dispatchResult = await this.dispatch.execute(persisted.id!);

      return {
        periodKey: input.periodKey,
        status: 'completed',
        collected: collection.collected,
        deduped: collection.deduped,
        triaged: survivorIds.length,
        classified,
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
