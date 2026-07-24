import { Article, type NormalizedArticleInput } from '../../domain/entities/Article.js';
import type { ArticleRepository } from '../../domain/repositories/ArticleRepository.js';
import { DeduplicationService } from '../../domain/services/DeduplicationService.js';
import type { CityProvider } from '../../domain/services/CityProvider.js';
import type { NewsSource } from '../../infrastructure/sources/NewsSource.js';

export interface CollectDisasterConfig {
  /** Termos de desastre combinados por cidade (OR). */
  terms: string[];
  /** Janela de recência em horas (desastre é notícia fresca). 0 = desliga. */
  maxAgeHours: number;
}

export interface CollectDisasterResult {
  /** Ids das notícias novas (track 'disaster') salvas neste ciclo. */
  savedIds: string[];
}

/**
 * CollectDisasterUseCase — coleta notícias de desastres climáticos nas cidades
 * onde a Audax tem Cedente/Sacado.
 *
 * As cidades vêm de um banco EXTERNO (via CityProvider); para cada cidade monta
 * uma busca `"<Cidade> <UF>" (enchente OR seca OR ...)` no SerpAPI. A fonte é
 * construída em tempo de execução porque as queries dependem do banco. Tolerante:
 * sem cidades (banco desligado/erro) → não coleta nada e o ciclo segue.
 */
export class CollectDisasterUseCase {
  constructor(
    private readonly cityProvider: CityProvider,
    /** Constrói uma fonte (SerpAPI) já com as queries dinâmicas por cidade. */
    private readonly buildSource: (queries: string[]) => NewsSource,
    private readonly articleRepository: ArticleRepository,
    private readonly config: CollectDisasterConfig,
    private readonly dedup: DeduplicationService = new DeduplicationService(),
  ) {}

  async execute(runId: string): Promise<CollectDisasterResult> {
    const cities = await this.cityProvider.getCities();
    if (cities.length === 0) return { savedIds: [] };

    const orTerms = this.config.terms.join(' OR ');
    const queries = cities.map((c) => {
      const local = `${c.cidade} ${c.uf}`.trim();
      return `"${local}" (${orTerms})`;
    });

    const source = this.buildSource(queries);
    let fetched: NormalizedArticleInput[] = [];
    try {
      fetched = await source.fetch();
    } catch (err) {
      console.error('⚠️  Coleta de desastres falhou:', (err as Error).message);
      return { savedIds: [] };
    }

    const recent =
      this.config.maxAgeHours > 0 ? this.filterRecent(fetched, this.config.maxAgeHours) : fetched;
    console.log(
      `🕒 recência ${this.config.maxAgeHours}h: ${recent.length}/${fetched.length} na janela (disaster, ${cities.length} cidades).`,
    );

    const articles = recent
      .filter((n) => n.title && n.url)
      .map((n) => Article.fromNormalized(n, runId, 'disaster'));
    const uniqueInBatch = this.dedup.dedupeWithinBatch(articles);

    const existing = await this.articleRepository.findExistingHashes(
      uniqueInBatch.map((a) => a.contentHash),
    );
    const fresh = uniqueInBatch.filter((a) => !existing.has(a.contentHash));

    const saved = await this.articleRepository.saveNew(fresh);
    return { savedIds: saved.map((a) => a.id!).filter(Boolean) };
  }

  private filterRecent(
    items: NormalizedArticleInput[],
    maxAgeHours: number,
  ): NormalizedArticleInput[] {
    const cutoff = Date.now() - maxAgeHours * 60 * 60 * 1000;
    // Desastre exige data recente — descarta itens sem data (não assume recência).
    return items.filter((n) => n.publishedAt !== null && n.publishedAt.getTime() >= cutoff);
  }
}
