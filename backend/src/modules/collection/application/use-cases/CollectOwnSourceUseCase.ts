import { Article, type ArticleTrack } from '../../domain/entities/Article.js';
import type { ArticleRepository } from '../../domain/repositories/ArticleRepository.js';
import { DeduplicationService } from '../../domain/services/DeduplicationService.js';
import type { NewsSource } from '../../infrastructure/sources/NewsSource.js';

export interface CollectOwnSourceConfig {
  /** Trilha em que o conteúdo da casa é gravado (hoje: 'fidc'). */
  track: ArticleTrack;
  /** Host público da fonte (ex.: 'fidcnews.com.br') — usado na busca no banco. */
  host: string;
  /** Janela de recência, em dias. */
  maxAgeDays: number;
  /** Quantos itens ocupam a vaga fixa por ciclo. */
  maxItems: number;
}

export interface CollectOwnSourceResult {
  /** Ids que devem ocupar a vaga fixa no digest desta rodada. */
  pinnedIds: string[];
  /** Quantos itens NOVOS o feed trouxe (0 = nada publicado desde o último ciclo). */
  fetched: number;
}

/**
 * CollectOwnSourceUseCase — a "vaga fixa" do conteúdo da CASA no digest.
 *
 * O fidcnews.com.br é do grupo, então ele não disputa espaço com o resto: não
 * passa por triagem, nem por piso de relevância. O objetivo é que TODO ciclo
 * leve um item nosso.
 *
 * Duas etapas, e a segunda é o que dá a garantia:
 *   1. Lê o feed e persiste o que for novo (dedup por content_hash, igual às
 *      demais trilhas — a mesma URL nunca entra duas vezes).
 *   2. Escolhe do BANCO o item mais recente do host que ainda NÃO foi surfado.
 *      Por isso um ciclo sem publicação nova ainda tem o que mandar (usa o
 *      estoque coletado antes), e um item já enviado nunca volta.
 *
 * Tolerante a falha: qualquer erro de rede/feed é logado e a etapa 2 ainda roda
 * em cima do que já está no banco. Falha de banco → `pinnedIds` vazio e o ciclo
 * segue sem a vaga fixa (nunca derruba o digest).
 */
export class CollectOwnSourceUseCase {
  constructor(
    private readonly source: NewsSource,
    private readonly articleRepository: ArticleRepository,
    private readonly config: CollectOwnSourceConfig,
    private readonly dedup: DeduplicationService = new DeduplicationService(),
  ) {}

  async execute(runId: string): Promise<CollectOwnSourceResult> {
    const fetched = await this.ingest(runId);

    let pinnedIds: string[] = [];
    try {
      const candidates = await this.articleRepository.findRecentUnsurfacedByHost({
        track: this.config.track,
        host: this.config.host,
        sinceDays: this.config.maxAgeDays,
        limit: Math.max(this.config.maxItems, 1),
      });
      pinnedIds = candidates.map((a) => a.id!).filter(Boolean);

      if (pinnedIds.length === 0) {
        console.log(
          `📌 Fonte própria (${this.config.host}): nada inédito na janela de ${this.config.maxAgeDays}d — digest sai sem a vaga fixa.`,
        );
      } else {
        console.log(
          `📌 Fonte própria (${this.config.host}): ${pinnedIds.length} item(ns) na vaga fixa (${fetched} novo(s) no feed).`,
        );
        for (const a of candidates) console.log(`   ↳ ${a.title.slice(0, 80)}`);
      }
    } catch (err) {
      console.error(
        `⚠️  Vaga fixa de ${this.config.host} falhou (digest segue sem ela):`,
        (err as Error).message,
      );
    }

    return { pinnedIds, fetched };
  }

  /** Lê o feed e grava o que ainda não existe. Retorna quantos entraram. */
  private async ingest(runId: string): Promise<number> {
    try {
      const normalized = await this.source.fetch();
      const cutoff = Date.now() - this.config.maxAgeDays * 24 * 60 * 60 * 1000;
      // Janela ESTRITA (descarta sem data): o feed é nosso, a data sempre vem;
      // item sem data aqui é sinal de feed quebrado, não de notícia fresca.
      const recent = normalized.filter(
        (n) => n.title && n.url && n.publishedAt && n.publishedAt.getTime() >= cutoff,
      );

      const articles = recent.map((n) => Article.fromNormalized(n, runId, this.config.track));
      const uniqueInBatch = this.dedup.dedupeWithinBatch(articles);
      const existing = await this.articleRepository.findExistingHashes(
        uniqueInBatch.map((a) => a.contentHash),
      );
      const fresh = uniqueInBatch.filter((a) => !existing.has(a.contentHash));
      const saved = await this.articleRepository.saveNew(fresh);
      return saved.length;
    } catch (err) {
      console.error(
        `⚠️  Leitura do feed da casa (${this.config.host}) falhou:`,
        (err as Error).message,
      );
      return 0;
    }
  }
}
