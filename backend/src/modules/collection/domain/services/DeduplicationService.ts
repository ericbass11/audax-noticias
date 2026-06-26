import type { Article } from '../entities/Article.js';

/** Domínios com paywall — preferimos a versão de fonte ABERTA num cluster. */
const DEFAULT_PAYWALL_DOMAINS = [
  'valor.globo.com',
  'estadao.com.br',
  'folha.uol.com.br',
  'oglobo.globo.com',
];

/** Palavras curtas/sem valor semântico, ignoradas na comparação de títulos. */
const STOPWORDS = new Set([
  'de', 'da', 'do', 'das', 'dos', 'e', 'o', 'a', 'os', 'as', 'em', 'no', 'na',
  'nos', 'nas', 'para', 'por', 'com', 'que', 'um', 'uma', 'ao', 'aos', 'se',
  'sobre', 'mais', 'sem', 'the', 'of', 'to', 'in',
]);

/**
 * DeduplicationService — serviço de domínio puro.
 *
 * Remove duplicatas DENTRO de um lote recém-coletado em duas camadas:
 *   1. EXATA: mesmo content_hash (mesma notícia da mesma URL em fontes diferentes).
 *   2. NEAR-DUPLICATE: títulos muito parecidos (a mesma matéria publicada por
 *      vários veículos). Cada cluster colapsa em UM representante, preferindo a
 *      fonte ABERTA (não-paywall) — assim não repetimos no WhatsApp/portal nem
 *      pagamos análise 2× pela mesma história, e o leitor cai numa fonte legível.
 *
 * A deduplicação contra o que já está persistido fica no repositório
 * (findExistingHashes), pois depende de I/O.
 */
export class DeduplicationService {
  constructor(
    private readonly paywallDomains: string[] = DEFAULT_PAYWALL_DOMAINS,
    /** Limiar de similaridade (Jaccard) para considerar a mesma matéria. */
    private readonly threshold = 0.6,
  ) {}

  dedupeWithinBatch(articles: Article[]): Article[] {
    // 1. Dedup exata por content_hash.
    const seen = new Set<string>();
    const unique: Article[] = [];
    for (const article of articles) {
      if (seen.has(article.contentHash)) continue;
      seen.add(article.contentHash);
      unique.push(article);
    }

    // 2. Clustering near-duplicate por similaridade de título.
    const clusters: { tokens: Set<string>; rep: Article }[] = [];
    for (const article of unique) {
      const tokens = this.tokenize(article.title);
      const match = clusters.find((c) => this.isSameStory(tokens, c.tokens));
      if (match) {
        match.rep = this.preferred(match.rep, article);
      } else {
        clusters.push({ tokens, rep: article });
      }
    }
    return clusters.map((c) => c.rep);
  }

  /** Título → conjunto de tokens normalizados (sem acento, sem stopwords). */
  private tokenize(title: string): Set<string> {
    const words = title
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '') // remove acentos (diacríticos combinantes)
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter((w) => w.length > 2 && !STOPWORDS.has(w));
    return new Set(words);
  }

  /** Mesma matéria? Jaccard alto OU um título quase contido no outro. */
  private isSameStory(a: Set<string>, b: Set<string>): boolean {
    if (a.size === 0 || b.size === 0) return false;
    let inter = 0;
    for (const t of a) if (b.has(t)) inter += 1;
    if (inter === 0) return false;
    const union = a.size + b.size - inter;
    const jaccard = inter / union;
    const containment = inter / Math.min(a.size, b.size);
    return jaccard >= this.threshold || containment >= 0.8;
  }

  /** Escolhe o melhor representante do cluster: fonte aberta > título mais completo. */
  private preferred(current: Article, candidate: Article): Article {
    const currentPaywall = this.isPaywalled(current.url);
    const candidatePaywall = this.isPaywalled(candidate.url);
    if (currentPaywall !== candidatePaywall) {
      return currentPaywall ? candidate : current; // mantém a aberta
    }
    // Empate de acesso: fica com o título mais longo (geralmente mais completo).
    return candidate.title.trim().length > current.title.trim().length ? candidate : current;
  }

  private isPaywalled(url: string): boolean {
    try {
      const host = new URL(url).hostname.toLowerCase();
      return this.paywallDomains.some((d) => host === d || host.endsWith(`.${d}`));
    } catch {
      return false;
    }
  }
}
