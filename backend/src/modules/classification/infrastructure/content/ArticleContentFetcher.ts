import { extract } from '@extractus/article-extractor';

export interface FetchedContent {
  /** true se conseguimos extrair o corpo do artigo. */
  success: boolean;
  /** Texto limpo do artigo (ou null). */
  text: string | null;
  /** Tamanho do texto extraído. */
  chars: number;
  /** Motivo da falha (paywall, timeout, conteúdo insuficiente...). */
  reason: string | null;
}

/** Domínios com paywall conhecidos — não tentamos extrair (conteúdo bloqueado). */
const DEFAULT_PAYWALL_DOMAINS = [
  'valor.globo.com',
  'estadao.com.br',
  'folha.uol.com.br',
  'oglobo.globo.com',
];

/**
 * ArticleContentFetcher — busca e extrai o CORPO do artigo a partir da URL,
 * usando um leitor de conteúdo (Readability via @extractus/article-extractor).
 *
 * Estratégia "gratuita + fallback": cobre a maioria das fontes abertas. Para
 * domínios em paywall (ou falha/JS/anti-bot), retorna success=false e o motivo
 * — o use case de análise cai então para título/resumo, marcando sourceRead.
 */
export class ArticleContentFetcher {
  constructor(
    private readonly paywallDomains: string[] = DEFAULT_PAYWALL_DOMAINS,
    /** Mínimo de caracteres para considerar a extração útil. */
    private readonly minChars = 400,
    /** Teto de caracteres enviados ao LLM (controla custo de tokens). */
    private readonly maxChars = 12000,
    private readonly timeoutMs = 15000,
  ) {}

  async fetch(url: string): Promise<FetchedContent> {
    if (this.isPaywalled(url)) {
      return { success: false, text: null, chars: 0, reason: 'paywall' };
    }

    try {
      const article = (await Promise.race([
        extract(url),
        this.timeout(),
      ])) as { content?: string } | null;

      const text = this.htmlToText(article?.content ?? '');
      if (text.length < this.minChars) {
        return { success: false, text: text || null, chars: text.length, reason: 'conteúdo insuficiente' };
      }
      const capped = text.slice(0, this.maxChars);
      return { success: true, text: capped, chars: capped.length, reason: null };
    } catch (err) {
      return { success: false, text: null, chars: 0, reason: (err as Error).message };
    }
  }

  private isPaywalled(url: string): boolean {
    try {
      const host = new URL(url).hostname.toLowerCase();
      return this.paywallDomains.some((d) => host === d || host.endsWith(`.${d}`));
    } catch {
      return false;
    }
  }

  private timeout(): Promise<never> {
    return new Promise((_, reject) =>
      setTimeout(() => reject(new Error(`timeout ${this.timeoutMs}ms`)), this.timeoutMs),
    );
  }

  /** Remove HTML e normaliza espaços para texto puro. */
  private htmlToText(html: string): string {
    return html
      .replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<\/(p|div|br|li|h[1-6])>/gi, '\n')
      .replace(/<[^>]+>/g, ' ')
      .replace(/&nbsp;/gi, ' ')
      .replace(/&amp;/gi, '&')
      .replace(/&lt;/gi, '<')
      .replace(/&gt;/gi, '>')
      .replace(/&quot;/gi, '"')
      .replace(/&#39;/gi, "'")
      .replace(/[ \t]+/g, ' ')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  }
}
