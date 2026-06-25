import Parser from 'rss-parser';
import type { NormalizedArticleInput } from '../../domain/entities/Article.js';
import type { NewsSource } from './NewsSource.js';

/**
 * Agrega múltiplos feeds RSS (agro + economia) via rss-parser e normaliza
 * para o schema único. A lista de URLs vem de config (env RSS_FEEDS) —
 * começa com placeholders que o operador preenche.
 */
export class RssClient implements NewsSource {
  readonly name = 'RSS';
  private readonly parser = new Parser({ timeout: 15000 });

  constructor(private readonly feedUrls: string[]) {}

  async fetch(): Promise<NormalizedArticleInput[]> {
    if (this.feedUrls.length === 0) {
      console.warn('⚠️  RSS_FEEDS vazio — pulando coleta via RSS.');
      return [];
    }

    const results = await Promise.allSettled(this.feedUrls.map((url) => this.fetchFeed(url)));

    const articles: NormalizedArticleInput[] = [];
    results.forEach((r, i) => {
      if (r.status === 'fulfilled') {
        articles.push(...r.value);
      } else {
        console.error(`⚠️  Falha ao ler feed RSS ${this.feedUrls[i]}:`, r.reason?.message ?? r.reason);
      }
    });
    return articles;
  }

  private async fetchFeed(url: string): Promise<NormalizedArticleInput[]> {
    const feed = await this.parser.parseURL(url);
    const sourceName = feed.title ?? url;

    return (feed.items ?? []).map((item) => ({
      title: item.title ?? '(sem título)',
      summary: item.contentSnippet ?? item.content ?? null,
      url: item.link ?? url,
      source: sourceName,
      sourceType: 'rss' as const,
      rawCategory: item.categories?.[0] ?? null,
      publishedAt: item.isoDate ? new Date(item.isoDate) : null,
    }));
  }
}
