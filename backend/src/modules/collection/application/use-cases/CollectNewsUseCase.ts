import { Article, type NormalizedArticleInput } from '../../domain/entities/Article.js';
import type { ArticleRepository } from '../../domain/repositories/ArticleRepository.js';
import { DeduplicationService } from '../../domain/services/DeduplicationService.js';
import type { NewsSource } from '../../infrastructure/sources/NewsSource.js';

export interface CollectNewsResult {
  collected: number; // total bruto vindo das fontes
  recent: number; // após aplicar a janela de recência
  deduped: number; // após remover duplicatas no lote + já existentes
  savedArticleIds: string[]; // novos persistidos (vão para classificação)
}

/**
 * CollectNewsUseCase — orquestra a coleta:
 *   1. busca em todas as fontes (em paralelo, tolerante a falha individual)
 *   2. normaliza para Article (deriva content_hash)
 *   3. deduplica dentro do lote
 *   4. descarta os que já existem no banco (idempotência)
 *   5. persiste só os novos
 *
 * Retorna os ids dos artigos NOVOS, que a etapa de classificação consome.
 */
export class CollectNewsUseCase {
  constructor(
    private readonly sources: NewsSource[],
    private readonly articleRepository: ArticleRepository,
    /** Janela de recência em horas; 0 desliga o filtro (coleta tudo). */
    private readonly maxAgeHours: number = 24,
    private readonly dedup: DeduplicationService = new DeduplicationService(),
  ) {}

  async execute(runId: string): Promise<CollectNewsResult> {
    // 1. Coleta de todas as fontes; uma fonte que falha não derruba as outras.
    const fetched = await Promise.allSettled(this.sources.map((s) => s.fetch()));
    const normalized = fetched.flatMap((r, i) => {
      if (r.status === 'fulfilled') return r.value;
      console.error(`⚠️  Fonte "${this.sources[i]?.name}" falhou:`, r.reason?.message ?? r.reason);
      return [];
    });

    const collected = normalized.length;

    // 1b. Janela de recência: descarta matérias antigas que as fontes devolvem
    // junto com as do dia. Itens sem data são mantidos (não dá para datar).
    const recent = this.maxAgeHours > 0 ? this.filterRecent(normalized) : normalized;
    if (this.maxAgeHours > 0) {
      console.log(
        `🕒 Recência (${this.maxAgeHours}h): ${recent.length}/${collected} dentro da janela.`,
      );
    }

    // 2. + 3. Entidades + dedup dentro do lote.
    const articles = recent
      .filter((n) => n.title && n.url)
      .map((n) => Article.fromNormalized(n, runId));
    const uniqueInBatch = this.dedup.dedupeWithinBatch(articles);

    // 4. Remove os que já existem no banco.
    const existing = await this.articleRepository.findExistingHashes(
      uniqueInBatch.map((a) => a.contentHash),
    );
    const fresh = uniqueInBatch.filter((a) => !existing.has(a.contentHash));

    // 5. Persiste só os novos (saveNew ainda protege com ON CONFLICT).
    const saved = await this.articleRepository.saveNew(fresh);

    return {
      collected,
      recent: recent.length,
      deduped: fresh.length,
      savedArticleIds: saved.map((a) => a.id!).filter(Boolean),
    };
  }

  /** Mantém itens publicados nas últimas `maxAgeHours`; sem data → mantém. */
  private filterRecent(items: NormalizedArticleInput[]): NormalizedArticleInput[] {
    const cutoff = Date.now() - this.maxAgeHours * 60 * 60 * 1000;
    return items.filter((n) => !n.publishedAt || n.publishedAt.getTime() >= cutoff);
  }
}
