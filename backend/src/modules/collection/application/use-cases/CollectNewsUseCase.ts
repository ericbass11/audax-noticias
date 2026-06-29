import { Article, type ArticleTrack, type NormalizedArticleInput } from '../../domain/entities/Article.js';
import type { ArticleRepository } from '../../domain/repositories/ArticleRepository.js';
import { DeduplicationService } from '../../domain/services/DeduplicationService.js';
import type { NewsSource } from '../../infrastructure/sources/NewsSource.js';

export interface CollectNewsResult {
  collected: number; // total bruto vindo das fontes
  recent: number; // após aplicar a janela de recência
  deduped: number; // novos do fluxo normal (vão para triagem)
  savedArticleIds: string[]; // novos do fluxo 'news'
  watchlistArticleIds: string[]; // novos da rota de vigilância (ANVISA etc.)
}

/**
 * CollectNewsUseCase — orquestra a coleta em DUAS trilhas:
 *   - 'news': fontes normais (agro/macro), janela de recência curta (24h).
 *   - 'watchlist': vigilância regulatória (ex.: ANVISA), janela ampla (dias),
 *     que pula a triagem e sempre entra no portal (rota própria).
 *
 * Para cada trilha: busca → recência → normaliza → dedup → descarta existentes
 * → persiste. Retorna os ids novos de cada trilha.
 */
export class CollectNewsUseCase {
  constructor(
    private readonly sources: NewsSource[],
    private readonly watchlistSources: NewsSource[],
    private readonly articleRepository: ArticleRepository,
    /** Janela de recência do fluxo normal, em horas (0 desliga). */
    private readonly maxAgeHours: number = 24,
    /** Janela de recência da watchlist, em horas (ex.: 30 dias = 720h). */
    private readonly watchlistMaxAgeHours: number = 720,
    /** Teto de itens da watchlist por ciclo (mais recentes); 0 = sem teto. */
    private readonly watchlistMaxItems: number = 20,
    private readonly dedup: DeduplicationService = new DeduplicationService(),
  ) {}

  async execute(runId: string): Promise<CollectNewsResult> {
    const news = await this.collectTrack(this.sources, this.maxAgeHours, 0, 'news', runId);
    const watch = await this.collectTrack(
      this.watchlistSources,
      this.watchlistMaxAgeHours,
      this.watchlistMaxItems,
      'watchlist',
      runId,
    );

    return {
      collected: news.collected + watch.collected,
      recent: news.recent + watch.recent,
      deduped: news.savedIds.length,
      savedArticleIds: news.savedIds,
      watchlistArticleIds: watch.savedIds,
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

    // 1. Coleta de todas as fontes; uma fonte que falha não derruba as outras.
    const fetched = await Promise.allSettled(sources.map((s) => s.fetch()));
    const normalized = fetched.flatMap((r, i) => {
      if (r.status === 'fulfilled') return r.value;
      console.error(`⚠️  Fonte "${sources[i]?.name}" falhou:`, r.reason?.message ?? r.reason);
      return [];
    });
    const collected = normalized.length;

    // 1b. Janela de recência.
    const recent = maxAgeHours > 0 ? this.filterRecent(normalized, maxAgeHours) : normalized;
    const label = track === 'watchlist' ? `vigilância ${maxAgeHours}h` : `recência ${maxAgeHours}h`;
    if (maxAgeHours > 0) {
      console.log(`🕒 ${label}: ${recent.length}/${collected} dentro da janela (${track}).`);
    }

    // 1c. Teto opcional: mantém só os mais recentes (controla custo da watchlist).
    const capped =
      maxItems > 0 && recent.length > maxItems
        ? [...recent]
            .sort((a, b) => (b.publishedAt?.getTime() ?? 0) - (a.publishedAt?.getTime() ?? 0))
            .slice(0, maxItems)
        : recent;

    // 2. + 3. Entidades + dedup dentro do lote.
    const articles = capped
      .filter((n) => n.title && n.url)
      .map((n) => Article.fromNormalized(n, runId, track));
    const uniqueInBatch = this.dedup.dedupeWithinBatch(articles);

    // 4. Remove os que já existem no banco.
    const existing = await this.articleRepository.findExistingHashes(
      uniqueInBatch.map((a) => a.contentHash),
    );
    const fresh = uniqueInBatch.filter((a) => !existing.has(a.contentHash));

    // 5. Persiste só os novos.
    const saved = await this.articleRepository.saveNew(fresh);
    return { collected, recent: recent.length, savedIds: saved.map((a) => a.id!).filter(Boolean) };
  }

  /** Mantém itens publicados nas últimas `maxAgeHours`; sem data → mantém. */
  private filterRecent(
    items: NormalizedArticleInput[],
    maxAgeHours: number,
  ): NormalizedArticleInput[] {
    const cutoff = Date.now() - maxAgeHours * 60 * 60 * 1000;
    return items.filter((n) => !n.publishedAt || n.publishedAt.getTime() >= cutoff);
  }
}
