import { Article, type ArticleTrack, type NormalizedArticleInput } from '../../domain/entities/Article.js';
import type { ArticleRepository } from '../../domain/repositories/ArticleRepository.js';
import { DeduplicationService } from '../../domain/services/DeduplicationService.js';
import { hasBlockedHostSuffix, isSponsoredUrl } from '../../domain/services/UrlPolicy.js';
import type { NewsSource } from '../../infrastructure/sources/NewsSource.js';

/** Configuração de uma rota extra (watchlist ANVISA, mercado FIDC, ...). */
export interface ExtraTrackConfig {
  track: ArticleTrack;
  sources: NewsSource[];
  maxAgeHours: number;
  maxItems: number; // 0 = sem teto
  /**
   * Sufixos de host bloqueados SÓ nesta rota (ex.: ['pt'] mantém a trilha FIDC
   * no mercado brasileiro). Vazio/ausente = sem bloqueio.
   */
  blockedHostSuffixes?: string[];
}

/**
 * Filtros de URL aplicados a TODAS as trilhas na coleta. Listas vazias
 * desligam o filtro correspondente.
 */
export interface CollectUrlFilters {
  /** Padrões de URL de conteúdo patrocinado/publicitário. */
  sponsoredUrlPatterns?: string[];
}

export interface CollectNewsResult {
  collected: number; // total bruto de todas as trilhas
  recent: number; // após recência (todas as trilhas)
  deduped: number; // novos do fluxo 'news'
  savedArticleIds: string[]; // novos do fluxo 'news' (vão para triagem)
  byTrack: Partial<Record<ArticleTrack, string[]>>; // novos por rota extra
  // TODAS as fontes do fluxo 'news' falharam (provável queda de rede). Sinaliza
  // ao ciclo que "0 notícias" foi por FALHA, não por não haver nada novo.
  newsCollectionFailed: boolean;
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
    /** Filtros de URL (conteúdo patrocinado). Ausente = nenhum filtro. */
    private readonly urlFilters: CollectUrlFilters = {},
  ) {}

  async execute(runId: string): Promise<CollectNewsResult> {
    // Fluxo 'news': janela curta (24h) e ESTRITA — descarta itens sem data
    // reconhecida (não assume que são recentes), fechando a brecha de notícias
    // antigas escaparem no digest do CEO. FIDC/ANVISA mantêm o comportamento
    // tolerante (janela larga: 7/30 dias).
    const news = await this.collectTrack(this.sources, this.maxAgeHours, 0, 'news', runId, true);

    let collected = news.collected;
    let recent = news.recent;
    const byTrack: Partial<Record<ArticleTrack, string[]>> = {};

    for (const t of this.extraTracks) {
      const r = await this.collectTrack(
        t.sources,
        t.maxAgeHours,
        t.maxItems,
        t.track,
        runId,
        false,
        t.blockedHostSuffixes ?? [],
      );
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
      // Falha total = havia fontes e TODAS falharam.
      newsCollectionFailed: news.sourcesTotal > 0 && news.sourcesFailed === news.sourcesTotal,
    };
  }

  private async collectTrack(
    sources: NewsSource[],
    maxAgeHours: number,
    maxItems: number,
    track: ArticleTrack,
    runId: string,
    dropUndated = false,
    /** Sufixos de host bloqueados nesta rota (vazio = sem bloqueio). */
    blockedHostSuffixes: string[] = [],
  ): Promise<{
    collected: number;
    recent: number;
    savedIds: string[];
    sourcesTotal: number;
    sourcesFailed: number;
  }> {
    if (sources.length === 0)
      return { collected: 0, recent: 0, savedIds: [], sourcesTotal: 0, sourcesFailed: 0 };

    const fetched = await Promise.allSettled(sources.map((s) => s.fetch()));
    let sourcesFailed = 0;
    const normalized = fetched.flatMap((r, i) => {
      if (r.status === 'fulfilled') return r.value;
      sourcesFailed++;
      console.error(`⚠️  Fonte "${sources[i]?.name}" falhou:`, r.reason?.message ?? r.reason);
      return [];
    });
    const collected = normalized.length;

    const recent =
      maxAgeHours > 0 ? this.filterRecent(normalized, maxAgeHours, dropUndated) : normalized;
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

    // Filtros determinísticos de URL. Ambos são "na dúvida mantém" (ver
    // UrlPolicy) e o que cai é LOGADO — corte silencioso mascara problema.
    const sponsoredPatterns = this.urlFilters.sponsoredUrlPatterns ?? [];
    let droppedSponsored = 0;
    let droppedHost = 0;
    const allowed = capped.filter((n) => {
      if (!n.title || !n.url) return false;
      if (isSponsoredUrl(n.url, sponsoredPatterns)) {
        droppedSponsored += 1;
        console.log(`🚫 patrocinado (${track}): ${n.title.slice(0, 70)} — ${n.url}`);
        return false;
      }
      if (hasBlockedHostSuffix(n.url, blockedHostSuffixes)) {
        droppedHost += 1;
        console.log(`🌍 fora do mercado (${track}): ${n.title.slice(0, 70)} — ${n.url}`);
        return false;
      }
      return true;
    });
    if (droppedSponsored > 0 || droppedHost > 0) {
      console.log(
        `🧯 Filtro de URL (${track}): ${droppedSponsored} patrocinado(s), ${droppedHost} fora do mercado.`,
      );
    }

    const articles = allowed.map((n) => Article.fromNormalized(n, runId, track));
    const uniqueInBatch = this.dedup.dedupeWithinBatch(articles);

    const existing = await this.articleRepository.findExistingHashes(
      uniqueInBatch.map((a) => a.contentHash),
    );
    const fresh = uniqueInBatch.filter((a) => !existing.has(a.contentHash));

    const saved = await this.articleRepository.saveNew(fresh);
    return {
      collected,
      recent: recent.length,
      savedIds: saved.map((a) => a.id!).filter(Boolean),
      sourcesTotal: sources.length,
      sourcesFailed,
    };
  }

  private filterRecent(
    items: NormalizedArticleInput[],
    maxAgeHours: number,
    dropUndated = false,
  ): NormalizedArticleInput[] {
    const cutoff = Date.now() - maxAgeHours * 60 * 60 * 1000;
    return items.filter((n) => {
      if (!n.publishedAt) return !dropUndated; // sem data: só passa se tolerante
      return n.publishedAt.getTime() >= cutoff;
    });
  }
}
