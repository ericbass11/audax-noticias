import { Article, type ArticleTrack, type NormalizedArticleInput } from '../../domain/entities/Article.js';
import type { ArticleRepository } from '../../domain/repositories/ArticleRepository.js';
import { DeduplicationService } from '../../domain/services/DeduplicationService.js';
import type { NewsSource } from '../../infrastructure/sources/NewsSource.js';

/** Configuração de uma rota extra (watchlist ANVISA, mercado FIDC, ...). */
export interface ExtraTrackConfig {
  track: ArticleTrack;
  sources: NewsSource[];
  maxAgeHours: number;
  maxItems: number; // 0 = sem teto
}

export interface CollectNewsResult {
  collected: number; // total bruto de todas as trilhas
  recent: number; // após recência (todas as trilhas)
  deduped: number; // novos do fluxo 'news'
  savedArticleIds: string[]; // novos do fluxo 'news' (vão para triagem)
  byTrack: Partial<Record<ArticleTrack, string[]>>; // novos por rota extra
}

/**
 * CollectNewsUseCase — coleta o fluxo normal ('news', janela curta, vai à
 * triagem) e N rotas EXTRAS (ex.: 'watchlist' ANVISA, 'fidc' mercado) que têm
 * janela/teto próprios, pulam a triagem e seguem para seus fluxos dedicados.
 *
 * Cada rota: busca → recência → (teto) → normaliza → dedup → descarta
 * existentes → persiste. Retorna os ids novos de cada rota.
 */
export class CollectNewsUseCase {
  constructor(
    private readonly sources: NewsSource[],
    private readonly articleRepository: ArticleRepository,
    /** Janela de recência do fluxo normal, em horas (0 desliga). */
    private readonly maxAgeHours: number = 24,
    /** Rotas extras (watchlist, fidc, ...). */
    private readonly extraTracks: ExtraTrackConfig[] = [],
    private readonly dedup: DeduplicationService = new DeduplicationService(),
  ) {}

  async execute(runId: string): Promise<CollectNewsResult> {
    const news = await this.collectTrack(this.sources, this.maxAgeHours, 0, 'news', runId);

    let collected = news.collected;
    let recent = news.recent;
    const byTrack: Partial<Record<ArticleTrack, string[]>> = {};

    for (const t of this.extraTracks) {
      const r = await this.collectTrack(t.sources, t.maxAgeHours, t.maxItems, t.track, runId);
      collected += r.collected;
      recent += r.recent;
      byTrack[t.track] = r.savedIds;
    }

    return {
      collected,
      recent,
      deduped: news.savedIds.length,
      savedArticleIds: news.savedIds,
      byTrack,
    };
  }

  private async collectTrack(
    sources: NewsSource[],
    maxAgeHours: number,
    maxItems: number,
    track: ArticleTrack,
    runId: string,
  ): Promise<{ collected: number; recent: number; savedIds: string[] }> {
    if (sources.length === 0) return { collected: 0, recent: 0, savedIds: [] };

    const fetched = await Promise.allSettled(sources.map((s) => s.fetch()));
    const normalized = fetched.flatMap((r, i) => {
      if (r.status === 'fulfilled') return r.value;
      console.error(`⚠️  Fonte "${sources[i]?.name}" falhou:`, r.reason?.message ?? r.reason);
      return [];
    });
    const collected = normalized.length;

    const recent = maxAgeHours > 0 ? this.filterRecent(normalized, maxAgeHours) : normalized;
    if (maxAgeHours > 0) {
      console.log(`🕒 recência ${maxAgeHours}h: ${recent.length}/${collected} na janela (${track}).`);
    }

    // Teto opcional: mantém só os mais recentes (controla custo das rotas extras).
    const capped =
      maxItems > 0 && recent.length > maxItems
        ? [...recent]
            .sort((a, b) => (b.publishedAt?.getTime() ?? 0) - (a.publishedAt?.getTime() ?? 0))
            .slice(0, maxItems)
        : recent;

    const articles = capped
      .filter((n) => n.title && n.url)
      .map((n) => Article.fromNormalized(n, runId, track));
    const uniqueInBatch = this.dedup.dedupeWithinBatch(articles);

    const existing = await this.articleRepository.findExistingHashes(
      uniqueInBatch.map((a) => a.contentHash),
    );
    const fresh = uniqueInBatch.filter((a) => !existing.has(a.contentHash));

    const saved = await this.articleRepository.saveNew(fresh);
    return { collected, recent: recent.length, savedIds: saved.map((a) => a.id!).filter(Boolean) };
  }

  private filterRecent(
    items: NormalizedArticleInput[],
    maxAgeHours: number,
  ): NormalizedArticleInput[] {
    const cutoff = Date.now() - maxAgeHours * 60 * 60 * 1000;
    return items.filter((n) => !n.publishedAt || n.publishedAt.getTime() >= cutoff);
  }
}
