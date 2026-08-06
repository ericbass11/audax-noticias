import Parser from 'rss-parser';
import type { NormalizedArticleInput } from '../../domain/entities/Article.js';
import { rewriteUrlOrigin } from '../../domain/services/UrlPolicy.js';
import type { NewsSource } from './NewsSource.js';

export interface RssClientOptions {
  /**
   * Origem pública que substitui a origem dos links do feed.
   *
   * Motivação real: o feed do fidcnews.com.br é gerado com a origem INTERNA do
   * servidor (`http://127.0.0.1:3360/slug`), então o link que chegaria ao
   * WhatsApp não abre. O caminho (slug) está correto — só a origem está errada.
   * Com esta opção, `http://127.0.0.1:3360/slug` vira `https://fidcnews.com.br/slug`.
   *
   * Ausente/inválida = mantém o link do feed como veio.
   */
  rewriteOrigin?: string;
  /** Nome legível da fonte. Ausente = usa o `<title>` do feed. */
  sourceName?: string;
  /** Rótulo do cliente nos logs (`⚠️ Fonte "X" falhou`). */
  label?: string;
}

/**
 * Agrega múltiplos feeds RSS (agro + economia) via rss-parser e normaliza
 * para o schema único. A lista de URLs vem de config (env RSS_FEEDS) —
 * começa com placeholders que o operador preenche.
 */
export class RssClient implements NewsSource {
  readonly name: string;
  private readonly parser = new Parser({ timeout: 15000 });

  constructor(
    private readonly feedUrls: string[],
    private readonly options: RssClientOptions = {},
  ) {
    this.name = options.label ?? 'RSS';
  }

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
    // Busca via fetch (caminho HTTP único, timeout explícito e cabeçalho de
    // user-agent que muitos feeds exigem) e parseia o XML como string.
    const res = await fetch(url, {
      signal: AbortSignal.timeout(15000),
      headers: { 'user-agent': 'AudaxNoticiasBot/1.0 (+https://audaxcapital.com.br)' },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const xml = await res.text();
    const feed = await this.parser.parseString(xml);
    const sourceName = this.options.sourceName ?? feed.title ?? url;

    return (feed.items ?? []).map((item) => ({
      title: item.title ?? '(sem título)',
      summary: item.contentSnippet ?? item.content ?? null,
      url: this.publicUrl(item.link ?? url),
      source: sourceName,
      sourceType: 'rss' as const,
      rawCategory: this.extractCategory(item.categories),
      publishedAt: item.isoDate ? new Date(item.isoDate) : null,
      imageUrl: item.enclosure?.url ?? null,
    }));
  }

  /** Ver `rewriteUrlOrigin`: aplica a origem pública configurada ao link. */
  private publicUrl(link: string): string {
    return rewriteUrlOrigin(link, this.options.rewriteOrigin);
  }

  /**
   * `<category>` pode vir como string ou como objeto (quando tem atributos
   * como `domain`). rss-parser expõe o texto em `_`. Normaliza para string.
   */
  private extractCategory(categories: unknown): string | null {
    if (!Array.isArray(categories) || categories.length === 0) return null;
    const first = categories[0];
    if (typeof first === 'string') return first;
    if (first && typeof first === 'object' && '_' in first) {
      const text = (first as { _: unknown })._;
      return typeof text === 'string' ? text : null;
    }
    return null;
  }
}
