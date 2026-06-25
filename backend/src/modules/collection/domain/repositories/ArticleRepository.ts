import type { Article } from '../entities/Article.js';

export interface ArticleListFilter {
  /** Data no formato YYYY-MM-DD (filtra por published_at no fuso BRT). */
  date?: string;
  category?: string;
  limit?: number;
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

  /** Notícias para a interface/leitura, já com filtros opcionais. */
  list(filter: ArticleListFilter): Promise<Article[]>;
}
