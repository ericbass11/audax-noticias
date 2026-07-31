import type { CollectNewsUseCase } from '../modules/collection/application/use-cases/CollectNewsUseCase.js';
import type { CollectDisasterUseCase } from '../modules/collection/application/use-cases/CollectDisasterUseCase.js';
import type { TriageArticlesUseCase } from '../modules/classification/application/use-cases/TriageArticlesUseCase.js';
import type { ClassifyArticlesUseCase } from '../modules/classification/application/use-cases/ClassifyArticlesUseCase.js';
import type { GenerateArticleAnalysisUseCase } from '../modules/classification/application/use-cases/GenerateArticleAnalysisUseCase.js';
import type { DedupeWatchlistUseCase } from '../modules/classification/application/use-cases/DedupeWatchlistUseCase.js';
import type { DedupeAgainstHistoryUseCase } from '../modules/classification/application/use-cases/DedupeAgainstHistoryUseCase.js';
import type { DispatchTrackDigestUseCase } from './DispatchTrackDigestUseCase.js';
import type { DispatchCommodityQuotesUseCase } from './DispatchCommodityQuotesUseCase.js';
import type { GenerateSummaryUseCase } from '../modules/classification/application/use-cases/GenerateSummaryUseCase.js';
import type { DispatchSummaryUseCase } from '../modules/notification/application/use-cases/DispatchSummaryUseCase.js';
import { ExecutiveSummary } from '../modules/notification/domain/entities/ExecutiveSummary.js';
import type { SummaryRepository } from '../modules/notification/domain/repositories/SummaryRepository.js';
import type { ProcessingRunRepository } from '../modules/shared/domain/ProcessingRunRepository.js';
import type { TriggerType } from '../modules/shared/domain/ProcessingRun.js';
import type { ArticleRepository } from '../modules/collection/domain/repositories/ArticleRepository.js';
import { DeduplicationService } from '../modules/collection/domain/services/DeduplicationService.js';

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
  /** Um digest REAL (notícias e/ou FIDC) foi enviado ao preview? Só então faz
   *  sentido promover ao grupo depois. */
  dispatchedToPreview?: boolean;
}

/**
 * Janela (dias) do dedup contra o histórico por trilha — quanto tempo para trás
 * olhamos para não reenviar a mesma história. Alinhado à janela de coleta de
 * cada trilha (news usa 3d p/ cobrir desdobramentos entre ciclos de 08h/18h).
 */
const HISTORY_WINDOW_DAYS: Record<'news' | 'watchlist' | 'fidc' | 'disaster', number> = {
  news: 3,
  fidc: 7,
  watchlist: 30,
  disaster: 5,
};

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
    /** Persistência de notícias — usada para MARCAR as IDs surfadas (digests). */
    private readonly articleRepository: ArticleRepository,
    private readonly runs: ProcessingRunRepository,
    private readonly collect: CollectNewsUseCase,
    private readonly triage: TriageArticlesUseCase,
    private readonly fidcTriage: TriageArticlesUseCase,
    private readonly classify: ClassifyArticlesUseCase,
    private readonly generateSummary: GenerateSummaryUseCase,
    private readonly analyze: GenerateArticleAnalysisUseCase,
    private readonly dedupeWatchlist: DedupeWatchlistUseCase,
    /** Dedup semântico do fluxo 'news' (mesma história em vários veículos). */
    private readonly dedupeNews: DedupeWatchlistUseCase,
    /** Dedup contra o histórico (não reenviar a mesma história em dias diferentes). */
    private readonly dedupeHistory: DedupeAgainstHistoryUseCase,
    private readonly summaries: SummaryRepository,
    private readonly dispatch: DispatchSummaryUseCase,
    private readonly dispatchTrackDigest: DispatchTrackDigestUseCase,
    private readonly dispatchCommodityQuotes: DispatchCommodityQuotesUseCase,
    /** Destinatários do 2º fluxo (mercado FIDC). */
    private readonly fidcRecipients: string[] = [],
    /** Incluir o bloco de alertas ANVISA no WhatsApp? (portal sempre recebe). */
    private readonly includeWatchlistInSummary = false,
    /** Coleta de desastres climáticos (praças com Cedente/Sacado). */
    private readonly collectDisaster?: CollectDisasterUseCase,
    /** Triagem da rota de desastres (confirma desastre real/recente; teto próprio). */
    private readonly disasterTriage?: TriageArticlesUseCase,
    /** Incluir o bloco de risco climático no digest do CEO? */
    private readonly includeDisasterInSummary = true,
    /** Teto de itens de desastre no bloco do digest (0 = sem teto). */
    private readonly disasterMaxItems = 6,
    /** Rodar a trilha de desastres só no ciclo da manhã? (economia de SerpAPI). */
    private readonly disasterOnlyMorning = true,
    /** Modo PREVIEW: se ligado + destinatários setados, o ciclo dispara TUDO
     *  para estes (número pessoal); a promoção ao grupo é feita depois. */
    private readonly previewRecipients: string[] = [],
    private readonly previewEnabled = false,
    /** Liga/desliga a análise profunda das 5 áreas (economia de Sonnet). Com
     *  false, pula fetch+LLM; a MARCAÇÃO de surfada e o resumo continuam. */
    private readonly analysisEnabled = true,
    /** Classificar a trilha FIDC (relevância/categoria/impacto)? Com false, a
     *  rota segue como era: só triagem, digest sem categoria e sem piso. */
    private readonly fidcClassifyEnabled = false,
    /** Piso de relevância do digest FIDC (0 = sem corte). Só vale para item
     *  COM classificação — item sem classificação nunca é descartado aqui. */
    private readonly fidcMinRelevance = 0,
    /** Cortar do digest FIDC as matérias que repetem o digest do CEO no mesmo
     *  ciclo (os dois podem ir ao mesmo grupo). */
    private readonly crossTrackDedupEnabled = false,
    /** Comparador de "mesma história" usado no dedup entre trilhas. */
    private readonly dedupService: DeduplicationService = new DeduplicationService(),
  ) {}

  /** Modo preview ativo? (todos os disparos do ciclo vão ao número pessoal). */
  private get previewMode(): boolean {
    return this.previewEnabled && this.previewRecipients.length > 0;
  }

  async execute(input: RunNewsCycleInput): Promise<RunNewsCycleResult> {
    const { run, created } = await this.runs.findOrCreate(input.periodKey, input.triggerType);

    if (!created && run.status === 'completed' && !input.force) {
      return { periodKey: input.periodKey, status: 'skipped', reason: 'turno já concluído' };
    }

    try {
      // 0. Boletim de cotações de commodities (3º fluxo) — snapshot fresco,
      // independente das notícias. Tolerante a falha.
      try {
        await this.dispatchCommodityQuotes.execute(
          this.previewMode ? this.previewRecipients : undefined,
        );
      } catch (err) {
        console.error('⚠️  Falha no boletim de cotações:', (err as Error).message);
      }

      // Marca se algum digest REAL (notícias/FIDC) foi ao preview — só então a
      // promoção ao grupo faz sentido (não promover turno vazio).
      let dispatchedToPreview = false;

      // 1. Coleta: 'news' (janela curta) + rotas extras ('watchlist' ANVISA,
      // 'fidc' mercado), cada uma com janela/teto próprios.
      const collection = await this.collect.execute(run.id!);

      // 1b. Trilha de desastres climáticos: cidades com Cedente/Sacado vêm de um
      // banco EXTERNO (via CollectDisasterUseCase). Desligável/tolerante.
      // Por economia de SerpAPI, roda só no ciclo da manhã (configurável).
      let disasterIds: string[] = [];
      const runDisaster = !this.disasterOnlyMorning || input.periodKey.endsWith(':morning');
      if (this.collectDisaster && runDisaster) {
        try {
          disasterIds = (await this.collectDisaster.execute(run.id!)).savedIds;
        } catch (err) {
          console.error('⚠️  Coleta de desastres falhou:', (err as Error).message);
        }
      }

      // Cura das rotas extras: agrupa notícias do MESMO evento (mesma matéria
      // em vários veículos) e mantém uma por evento.
      let watchlistIds = collection.byTrack.watchlist ?? [];
      let fidcIds = collection.byTrack.fidc ?? [];
      if (watchlistIds.length > 1) {
        try {
          watchlistIds = await this.dedupeWatchlist.execute(watchlistIds);
        } catch (err) {
          console.error('⚠️  Dedup da watchlist falhou:', (err as Error).message);
        }
      }
      // Não reenviar alertas ANVISA já enviados em dias anteriores.
      if (watchlistIds.length > 0) {
        watchlistIds = await this.dedupeHistory.execute(watchlistIds, {
          track: 'watchlist',
          sinceDays: HISTORY_WINDOW_DAYS.watchlist,
        });
      }
      if (fidcIds.length > 1) {
        try {
          fidcIds = await this.dedupeWatchlist.execute(fidcIds);
        } catch (err) {
          console.error('⚠️  Dedup FIDC falhou:', (err as Error).message);
        }
      }

      // Nada novo em nenhuma trilha → conclui o turno.
      if (
        collection.savedArticleIds.length === 0 &&
        watchlistIds.length === 0 &&
        fidcIds.length === 0 &&
        disasterIds.length === 0
      ) {
        // Distingue "sem notícias" de FALHA DE COLETA: se todas as fontes de
        // notícias caíram (provável blip de rede), lança erro para o worker
        // reprocessar (BullMQ, com backoff) em vez de concluir vazio e disparar
        // um digest sem conteúdo.
        if (collection.newsCollectionFailed) {
          throw new Error(
            'coleta de notícias falhou: todas as fontes indisponíveis (rede/serviço).',
          );
        }
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
        // Cura os sobreviventes: colapsa a MESMA história publicada por vários
        // veículos em um representante (o dedup por tokens não pega títulos
        // reescritos). Evita o digest do CEO com 7x a mesma matéria.
        if (survivorIds.length > 1) {
          try {
            survivorIds = await this.dedupeNews.execute(survivorIds);
          } catch (err) {
            console.error('⚠️  Dedup de notícias falhou:', (err as Error).message);
          }
        }
        // Não reenviar histórias já enviadas ao CEO em dias anteriores.
        if (survivorIds.length > 0) {
          survivorIds = await this.dedupeHistory.execute(survivorIds, {
            track: 'news',
            sinceDays: HISTORY_WINDOW_DAYS.news,
          });
        }
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
        if (this.analysisEnabled) {
          try {
            await this.analyze.execute(watchlistIds, { mode: 'watchlist' });
          } catch (err) {
            console.error('⚠️  Falha na análise de vigilância (ANVISA):', (err as Error).message);
          }
        }
        // Marca como surfadas SEMPRE (independe da análise) — sinal do dedup histórico.
        await this.articleRepository.markSurfaced(watchlistIds);
      }

      // 4b. Rota FIDC (2º fluxo): triagem de relevância (mantém o núcleo do
      // segmento e trata juros/BC/geopolítica como condicionais) → análise de
      // mercado/regulação → digest próprio para o destinatário separado.
      if (fidcIds.length > 0) {
        try {
          fidcIds = (await this.fidcTriage.execute(fidcIds)).survivorIds;
        } catch (err) {
          console.error('⚠️  Triagem FIDC falhou:', (err as Error).message);
        }
      }
      // Não reenviar matérias FIDC já enviadas em dias anteriores.
      if (fidcIds.length > 0) {
        fidcIds = await this.dedupeHistory.execute(fidcIds, {
          track: 'fidc',
          sinceDays: HISTORY_WINDOW_DAYS.fidc,
        });
      }
      // Dedup ENTRE trilhas: as duas rotas se sobrepõem por desenho (a trilha
      // 'news' tem a categoria "Setor FIDC"; a 'fidc' cobre mercado/regulação),
      // e os dois digests podem ir ao MESMO grupo. Aqui cortamos do digest FIDC
      // a matéria que repete uma já escolhida para o do CEO neste ciclo.
      // Determinístico (títulos, sem LLM) e tolerante: erro → não remove nada.
      // Roda ANTES da classificação para não gastar LLM em item que vai sair.
      if (this.crossTrackDedupEnabled && fidcIds.length > 0 && survivorIds.length > 0) {
        try {
          const newsTitles = (await this.articleRepository.findByIds(survivorIds)).map(
            (a) => a.title,
          );
          const fidcArticles = await this.articleRepository.findByIds(fidcIds);
          const repeated = fidcArticles.filter((a) =>
            this.dedupService.isSameStoryAsAny(a.title, newsTitles),
          );
          if (repeated.length > 0) {
            const dropIds = new Set(repeated.map((a) => a.id!));
            fidcIds = fidcIds.filter((id) => !dropIds.has(id));
            console.log(
              `🔀 Dedup entre trilhas: ${repeated.length} matéria(s) FIDC já cobertas pelo digest do CEO.`,
            );
            for (const a of repeated) console.log(`   ↳ ${a.title.slice(0, 80)}`);
          }
        } catch (err) {
          console.error(
            '⚠️  Dedup entre trilhas falhou (nada removido):',
            (err as Error).message,
          );
        }
      }
      // Classificação da trilha FIDC: dá relevância/categoria/impacto ao digest
      // e habilita o piso. Se falhar, os itens ficam SEM classificação e o
      // digest sai no formato antigo, sem corte — nunca perdemos notícia aqui.
      if (this.fidcClassifyEnabled && fidcIds.length > 0) {
        try {
          const result = await this.classify.execute(fidcIds);
          console.log(`🏷️  Classificação FIDC: ${result.classified}/${fidcIds.length} itens.`);
        } catch (err) {
          console.error(
            '⚠️  Classificação FIDC falhou (digest segue sem categoria/piso):',
            (err as Error).message,
          );
        }
      }
      if (fidcIds.length > 0) {
        // Por padrão marca todos (comportamento antigo); se o digest devolver o
        // recorte real, marca só o que saiu — igual à trilha de notícias.
        let surfacedFidcIds = fidcIds;
        try {
          // Análise profunda condicional; o digest FIDC não depende dela.
          if (this.analysisEnabled) {
            await this.analyze.execute(fidcIds, { mode: 'fidc' });
          }
          const digest = await this.dispatchTrackDigest.execute(
            run.id!,
            `${input.periodKey}:fidc`,
            fidcIds,
            'Audax | Mercado FIDC & Regulação',
            this.previewMode ? this.previewRecipients : this.fidcRecipients,
            // O piso só age em item COM classificação (ver DispatchTrackDigest).
            { minRelevance: this.fidcClassifyEnabled ? this.fidcMinRelevance : 0 },
          );
          if (digest.articleIds) surfacedFidcIds = digest.articleIds;
          dispatchedToPreview = true;
        } catch (err) {
          console.error('⚠️  Falha no fluxo FIDC:', (err as Error).message);
        }
        // Marca como surfadas SEMPRE (independe da análise) — sinal do dedup histórico.
        if (surfacedFidcIds.length > 0) {
          await this.articleRepository.markSurfaced(surfacedFidcIds);
        }
      }

      // 4c. Desastres climáticos: triagem (confirma desastre real/recente/
      // localizado) → não reenviar os já vistos → análise de risco de crédito
      // por praça (portal). O bloco entra no digest do CEO conforme o flag.
      if (disasterIds.length > 0 && this.disasterTriage) {
        try {
          disasterIds = (await this.disasterTriage.execute(disasterIds)).survivorIds;
        } catch (err) {
          console.error('⚠️  Triagem de desastres falhou:', (err as Error).message);
        }
      }
      // Colapsa near-dups (mesmo desastre/cidade em vários veículos — ex.: 3
      // matérias do mesmo incêndio) num representante, para não repetir contexto.
      // Preserva a ordem de score da triagem (o dedup pode reordenar).
      if (disasterIds.length > 1) {
        try {
          const kept = new Set(await this.dedupeNews.execute(disasterIds));
          disasterIds = disasterIds.filter((id) => kept.has(id));
        } catch (err) {
          console.error('⚠️  Dedup de desastres falhou:', (err as Error).message);
        }
      }
      // Não repetir desastres já enviados em dias anteriores.
      if (disasterIds.length > 0) {
        disasterIds = await this.dedupeHistory.execute(disasterIds, {
          track: 'disaster',
          sinceDays: HISTORY_WINDOW_DAYS.disaster,
        });
      }
      // Teto do bloco: evita um digest gigante (mostra os de maior score).
      if (this.disasterMaxItems > 0 && disasterIds.length > this.disasterMaxItems) {
        disasterIds = disasterIds.slice(0, this.disasterMaxItems);
      }
      if (disasterIds.length > 0) {
        try {
          await this.analyze.execute(disasterIds, { mode: 'disaster' });
        } catch (err) {
          console.error('⚠️  Falha na análise de desastres:', (err as Error).message);
        }
      }

      // 5. Resumo executivo: notícias relevantes (+ bloco ANVISA e/ou risco
      // climático só se os flags estiverem ligados). Alertas seguem no portal.
      const summary = await this.generateSummary.execute(
        survivorIds,
        this.includeWatchlistInSummary ? watchlistIds : [],
        this.includeDisasterInSummary ? disasterIds : [],
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
          dispatchedToPreview,
        };
      }

      // 6. Análise profunda (portal). ECONOMIA: analisa só as notícias que
      // REALMENTE aparecem (top-N do digest = `rankedArticleIds`), em vez de
      // todas ≥ piso de relevância — corta o nº de análises Sonnet por ciclo.
      // Condicional (ANALYSIS_ENABLED); tolerante a falha.
      if (this.analysisEnabled) {
        try {
          await this.analyze.execute(summary.rankedArticleIds);
        } catch (err) {
          console.error('⚠️  Falha na análise profunda (portal):', (err as Error).message);
        }
      }
      // Marca as notícias do digest como surfadas SEMPRE (independe da análise)
      // — é o sinal que o dedup histórico usa para não reenviar em dias futuros.
      await this.articleRepository.markSurfaced(summary.rankedArticleIds);

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
      const dispatchResult = await this.dispatch.execute(
        persisted.id!,
        this.previewMode ? { recipients: this.previewRecipients } : {},
      );
      if (dispatchResult.sent > 0) dispatchedToPreview = true;

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
        dispatchedToPreview,
      };
    } catch (err) {
      run.fail((err as Error).message);
      await this.runs.update(run);
      return { periodKey: input.periodKey, status: 'failed', reason: (err as Error).message };
    }
  }
}
