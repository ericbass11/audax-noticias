import type { NormalizedArticleInput } from '../../domain/entities/Article.js';
import type { NewsSource } from './NewsSource.js';

export interface GNewsConfig {
  apiKey: string;
  baseUrl: string;
  country: string;
  lang: string;
  queries: string[];
}

interface GNewsArticle {
  title: string;
  description: string | null;
  url: string;
  publishedAt: string;
  source?: { name?: string };
}

interface GNewsResponse {
  articles?: GNewsArticle[];
}

/**
 * Cliente GNews (gnews.io). Isolado atrás de NewsSource para que trocar por
 * NewsData.io depois seja só escrever outra implementação — sem mexer no
 * pipeline. A API key vem por config (env), nunca hardcoded.
 *
 * NOTA: o plano gratuito do GNews retorna poucos resultados por requisição e
 * tem rate limit. Fazemos uma requisição por termo de busca e agregamos.
 */
export class GNewsClient implements NewsSource {
  readonly name = 'GNews';

  constructor(private readonly config: GNewsConfig) {}

  async fetch(): Promise<NormalizedArticleInput[]> {
    if (!this.config.apiKey) {
      console.warn('⚠️  GNEWS_API_KEY ausente — pulando coleta via GNews.');
      return [];
    }
    if (this.config.queries.length === 0) {
      console.warn('⚠️  GNEWS_QUERIES vazio — pulando coleta via GNews.');
      return [];
    }

    const all: NormalizedArticleInput[] = [];
    for (const query of this.config.queries) {
      try {
        const articles = await this.search(query);
        all.push(...articles);
      } catch (err) {
        // Falha numa query não derruba a coleta inteira.
        console.error(`⚠️  GNews falhou para a query "${query}":`, (err as Error).message);
      }
    }
    return all;
  }

  private async search(query: string): Promise<NormalizedArticleInput[]> {
    const params = new URLSearchParams({
      q: query,
      country: this.config.country,
      lang: this.config.lang,
      max: '10',
      apikey: this.config.apiKey,
    });
    const url = `${this.config.baseUrl}/search?${params.toString()}`;

    const res = await fetch(url);
    if (!res.ok) {
      throw new Error(`GNews HTTP ${res.status}`);
    }
    const data = (await res.json()) as GNewsResponse;

    return (data.articles ?? []).map((a) => ({
      title: a.title,
      summary: a.description,
      url: a.url,
      source: a.source?.name ?? 'GNews',
      sourceType: 'gnews' as const,
      rawCategory: query, // a query que trouxe a notícia serve de pista de categoria
      publishedAt: a.publishedAt ? new Date(a.publishedAt) : null,
    }));
  }
}
