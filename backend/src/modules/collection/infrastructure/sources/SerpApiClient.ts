import type { NormalizedArticleInput } from '../../domain/entities/Article.js';
import type { NewsSource } from './NewsSource.js';

export interface SerpApiConfig {
  apiKey: string;
  baseUrl: string; // https://serpapi.com/search
  gl: string; // país, ex.: 'br'
  hl: string; // idioma, ex.: 'pt-br'
  queries: string[];
  // Espera (ms) entre requisições para respeitar o rate limit do SerpAPI.
  delayMs?: number;
  // Tentativas ao receber HTTP 429 (com backoff exponencial). 0 = não tenta de novo.
  maxRetries?: number;
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

interface SerpApiNewsItem {
  title?: string;
  link?: string;
  snippet?: string;
  date?: string;
  // O google_news também devolve uma data ISO limpa; preferimos esta.
  iso_date?: string;
  thumbnail?: string;
  thumbnail_small?: string;
  source?: { name?: string } | string;
  // O engine google_news às vezes agrupa resultados em "stories".
  stories?: SerpApiNewsItem[];
}

interface SerpApiResponse {
  news_results?: SerpApiNewsItem[];
  error?: string;
}

/**
 * Cliente SerpAPI (engine google_news). Isolado atrás de NewsSource como as
 * demais fontes — trocar/empilhar provedores não afeta o pipeline.
 *
 * Faz uma requisição por termo de `SERPAPI_QUERIES` e agrega. O google_news
 * pode devolver itens agrupados em `stories`; achatamos todos.
 */
export class SerpApiClient implements NewsSource {
  readonly name = 'SerpAPI';

  constructor(private readonly config: SerpApiConfig) {}

  async fetch(): Promise<NormalizedArticleInput[]> {
    if (!this.config.apiKey) {
      console.warn('⚠️  SERPAPI_API_KEY ausente — pulando coleta via SerpAPI.');
      return [];
    }
    if (this.config.queries.length === 0) {
      console.warn('⚠️  SERPAPI_QUERIES vazio — pulando coleta via SerpAPI.');
      return [];
    }

    const delayMs = this.config.delayMs ?? 2000;
    const all: NormalizedArticleInput[] = [];
    for (let i = 0; i < this.config.queries.length; i++) {
      const query = this.config.queries[i]!;
      // Espaça as requisições (fila) para não estourar o rate limit do SerpAPI.
      if (i > 0 && delayMs > 0) await sleep(delayMs);
      try {
        all.push(...(await this.search(query)));
      } catch (err) {
        console.error(`⚠️  SerpAPI falhou para a query "${query}":`, (err as Error).message);
      }
    }
    return all;
  }

  private async search(query: string): Promise<NormalizedArticleInput[]> {
    const params = new URLSearchParams({
      engine: 'google_news',
      q: query,
      gl: this.config.gl,
      hl: this.config.hl,
      api_key: this.config.apiKey,
    });

    const maxRetries = this.config.maxRetries ?? 4;
    let res: Response | undefined;
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      res = await fetch(`${this.config.baseUrl}?${params.toString()}`, {
        signal: AbortSignal.timeout(20000),
      });
      // 429 = rate limit: espera crescente (5s, 10s, 20s, 40s) e tenta de novo.
      if (res.status === 429 && attempt < maxRetries) {
        const backoff = 5000 * 2 ** attempt;
        console.warn(
          `⏳ SerpAPI 429 na query "${query}" — aguardando ${backoff / 1000}s (tentativa ${attempt + 1}/${maxRetries}).`,
        );
        await sleep(backoff);
        continue;
      }
      break;
    }
    if (!res || !res.ok) throw new Error(`SerpAPI HTTP ${res?.status ?? 'sem resposta'}`);

    const data = (await res.json()) as SerpApiResponse;
    if (data.error) throw new Error(data.error);

    // Achata itens diretos + os agrupados em "stories".
    const flat: SerpApiNewsItem[] = [];
    for (const item of data.news_results ?? []) {
      if (Array.isArray(item.stories) && item.stories.length > 0) {
        flat.push(...item.stories);
      } else {
        flat.push(item);
      }
    }

    return flat
      .filter((i) => i.title && i.link)
      .map((i) => ({
        title: i.title!,
        summary: i.snippet ?? null,
        url: i.link!,
        source: this.sourceName(i.source),
        sourceType: 'serpapi' as const,
        rawCategory: query,
        // Prefere iso_date (ISO 8601 confiável); cai para `date` se ausente.
        publishedAt: this.parseDate(i.iso_date ?? i.date),
        imageUrl: i.thumbnail ?? i.thumbnail_small ?? null,
      }));
  }

  private sourceName(source: SerpApiNewsItem['source']): string {
    if (!source) return 'Google News';
    if (typeof source === 'string') return source;
    return source.name ?? 'Google News';
  }

  /** As datas do google_news variam ("MM/DD/YYYY..." ou relativas). Falha → null. */
  private parseDate(date: string | undefined): Date | null {
    if (!date) return null;
    const parsed = new Date(date);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }
}
