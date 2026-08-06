import type { Article, ArticleTrack } from '../entities/Article.js';

export interface ArticleListFilter {
  /** Data no formato YYYY-MM-DD (filtra por published_at no fuso BRT). */
  date?: string;
  category?: string;
  limit?: number;
}

/** Referência leve (id + título) de uma notícia já surfada/enviada. */
export interface ArticleTitleRef {
  id: string;
  title: string;
}

export interface RecentSurfacedQuery {
  track: ArticleTrack;
  /** Janela para trás, em dias (compara pela data de coleta). */
  sinceDays: number;
  /** Ids a excluir (as próprias candidatas do ciclo atual). */
  excludeIds: string[];
  limit: number;
}

export interface RecentUnsurfacedQuery {
  track: ArticleTrack;
  /** Host da fonte (ex.: 'fidcnews.com.br'). Casa o host e seus subdomínios. */
  host: string;
  /** Janela para trás, em dias (compara pela data de publicação). */
  sinceDays: number;
  limit: number;
}

/**
 * Porta de persistência para notícias. Implementada na camada de
 * infraestrutura (Drizzle); o domínio depende apenas desta interface.
 */
export interface ArticleRepository {
  /** Insere apenas os que ainda não existem (ON CONFLICT content_hash). Retorna os inseridos com id. */
  saveNew(articles: Article[]): Promise<Article[]>;

  /** Dado um conjunto de hashes, retorna os que JÁ existem no banco. */
  findExistingHashes(hashes: string[]): Promise<Set<string>>;

  findById(id: string): Promise<Article | null>;

  /** Carrega múltiplos artigos por id (ex.: para (re)classificar um lote). */
  findByIds(ids: string[]): Promise<Article[]>;

  /** Atualiza a imagem de um artigo (enriquecimento com a og:image real). */
  updateImage(id: string, imageUrl: string): Promise<void>;

  /** Notícias para a interface/leitura, já com filtros opcionais. */
  list(filter: ArticleListFilter): Promise<Article[]>;

  /**
   * Marca as notícias como surfadas (expostas em um digest/portal) — grava
   * `surfaced_at = now()` apenas nas que ainda não tinham. Idempotente.
   */
  markSurfaced(ids: string[]): Promise<void>;

  /**
   * Notícias de uma trilha que JÁ foram surfadas (expostas no portal/digest)
   * dentro da janela — base para o dedup contra o histórico (não reenviar a
   * mesma história em dias diferentes). Mais recentes primeiro.
   */
  findRecentSurfaced(query: RecentSurfacedQuery): Promise<ArticleTitleRef[]>;

  /**
   * Notícias de UM host que ainda NÃO foram surfadas, dentro da janela. Base da
   * vaga fixa da fonte própria (fidcnews.com.br) no digest: garante um item por
   * ciclo mesmo quando nada novo foi publicado desde o ciclo anterior, sem
   * nunca repetir o que já saiu. Mais recentes primeiro.
   */
  findRecentUnsurfacedByHost(query: RecentUnsurfacedQuery): Promise<Article[]>;
}
