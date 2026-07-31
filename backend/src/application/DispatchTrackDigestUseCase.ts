import type { ArticleRepository } from '../modules/collection/domain/repositories/ArticleRepository.js';
import type { ClassificationRepository } from '../modules/classification/domain/repositories/ClassificationRepository.js';
import {
  ExecutiveSummaryBuilder,
  type WatchlistMessageItem,
} from '../modules/classification/domain/services/ExecutiveSummaryBuilder.js';
import { ExecutiveSummary } from '../modules/notification/domain/entities/ExecutiveSummary.js';
import type { SummaryRepository } from '../modules/notification/domain/repositories/SummaryRepository.js';
import type { DispatchSummaryUseCase } from '../modules/notification/application/use-cases/DispatchSummaryUseCase.js';

export interface DispatchTrackDigestResult {
  summaryId?: string;
  sent: number;
  failed: number;
  skipped: number;
  /**
   * Ids que REALMENTE entraram no digest (após o piso de relevância). O ciclo
   * usa isto para marcar como "surfado" só o que saiu — igual à trilha de
   * notícias. Assim um item cortado pelo piso não é queimado para sempre.
   */
  articleIds?: string[];
}

export interface DispatchTrackDigestOptions {
  /**
   * Piso de relevância. Só tem efeito em item que TEM classificação; item sem
   * classificação é sempre mantido (nunca perdemos notícia porque a
   * classificação falhou). 0 ou ausente = sem corte.
   */
  minRelevance?: number;
}

/** Item interno: o do builder + a relevância usada apenas para o corte/ordem. */
type RankedItem = WatchlistMessageItem & { relevance?: number };

/**
 * DispatchTrackDigestUseCase — monta um digest simples de uma rota (ex.: mercado
 * FIDC), persiste como resumo (periodKey próprio) e dispara para um destinatário
 * SEPARADO no WhatsApp. É o "2º fluxo de mensagem".
 *
 * A classificação é OPCIONAL: sem o repositório injetado, o digest sai exatamente
 * como antes (lista simples ordenada por data, sem corte). Com ele, cada item
 * ganha categoria/impacto e o corte de relevância passa a valer — sempre no
 * modo tolerante descrito em `DispatchTrackDigestOptions.minRelevance`.
 */
export class DispatchTrackDigestUseCase {
  private readonly builder = new ExecutiveSummaryBuilder();

  constructor(
    private readonly articleRepository: ArticleRepository,
    private readonly summaries: SummaryRepository,
    private readonly dispatch: DispatchSummaryUseCase,
    /** Ausente = rota sem classificação (comportamento original). */
    private readonly classifications?: ClassificationRepository,
  ) {}

  async execute(
    runId: string,
    periodKey: string,
    articleIds: string[],
    header: string,
    recipients: string[],
    opts: DispatchTrackDigestOptions = {},
  ): Promise<DispatchTrackDigestResult> {
    if (articleIds.length === 0) return { sent: 0, failed: 0, skipped: 0 };

    const articles = await this.articleRepository.findByIds(articleIds);
    const byArticle = await this.loadClassifications(articleIds);

    const ranked: RankedItem[] = articles.map((a) => {
      const c = byArticle.get(a.id!);
      return {
        id: a.id!,
        title: a.title,
        url: a.url,
        publishedAt: a.publishedAt,
        ...(c ? { category: c.category, impact: c.impact, relevance: c.relevance } : {}),
      };
    });

    const minRelevance = opts.minRelevance ?? 0;
    const kept =
      minRelevance > 0
        ? ranked.filter((it) => it.relevance === undefined || it.relevance >= minRelevance)
        : ranked;

    if (kept.length < ranked.length) {
      console.log(
        `🎚️  Digest "${header}": ${kept.length}/${ranked.length} acima do piso de relevância (>=${minRelevance}).`,
      );
    }
    if (kept.length === 0) return { sent: 0, failed: 0, skipped: 0, articleIds: [] };

    const items = this.sort(kept);
    const content = this.builder.buildTrackDigest(header, items);

    const persisted = await this.summaries.save(
      new ExecutiveSummary({
        runId,
        periodKey,
        content,
        articleRefs: items.map((it, i) => ({ articleId: it.id, rank: i + 1 })),
      }),
    );

    const result = await this.dispatch.execute(persisted.id!, { recipients });
    return { ...result, articleIds: items.map((it) => it.id) };
  }

  /**
   * Classificações vigentes dos artigos. Sem repositório → mapa vazio. Falha de
   * leitura também → mapa vazio, e o digest sai no formato simples em vez de
   * quebrar o ciclo.
   */
  private async loadClassifications(
    articleIds: string[],
  ): Promise<Map<string, { category: string; impact: WatchlistMessageItem['impact']; relevance: number }>> {
    if (!this.classifications) return new Map();
    try {
      const found = await this.classifications.findCurrentByArticleIds(articleIds);
      const out = new Map<
        string,
        { category: string; impact: WatchlistMessageItem['impact']; relevance: number }
      >();
      for (const [articleId, c] of found) {
        out.set(articleId, { category: c.category, impact: c.impact, relevance: c.relevance });
      }
      return out;
    } catch (err) {
      console.error('⚠️  Falha ao ler classificações do digest:', (err as Error).message);
      return new Map();
    }
  }

  /**
   * Relevância desc quando existe (o corte só faz sentido se o mais relevante
   * vier primeiro); empate e itens sem classificação caem para data desc, que é
   * a ordem original da rota.
   */
  private sort(items: RankedItem[]): RankedItem[] {
    const hasRelevance = items.some((it) => it.relevance !== undefined);
    return [...items].sort((x, y) => {
      if (hasRelevance) {
        const diff = (y.relevance ?? -1) - (x.relevance ?? -1);
        if (diff !== 0) return diff;
      }
      return (y.publishedAt?.getTime() ?? 0) - (x.publishedAt?.getTime() ?? 0);
    });
  }
}
