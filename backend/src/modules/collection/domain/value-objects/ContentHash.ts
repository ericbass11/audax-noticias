import { createHash } from 'node:crypto';

/**
 * ContentHash — chave de deduplicação determinística.
 *
 * Calculado como sha256(normalize(title) + '|' + normalize(url)). A
 * normalização (lowercase, trim, colapso de espaços, remoção de query string
 * de tracking) garante que a mesma notícia vinda de fontes/links levemente
 * diferentes gere o mesmo hash e não seja classificada nem disparada 2x.
 */
export class ContentHash {
  private constructor(public readonly value: string) {}

  static fromTitleAndUrl(title: string, url: string): ContentHash {
    const normalizedTitle = title.normalize('NFKC').toLowerCase().replace(/\s+/g, ' ').trim();
    const normalizedUrl = ContentHash.normalizeUrl(url);
    const digest = createHash('sha256')
      .update(`${normalizedTitle}|${normalizedUrl}`)
      .digest('hex');
    return new ContentHash(digest);
  }

  private static normalizeUrl(url: string): string {
    try {
      const parsed = new URL(url.trim());
      // Remove parâmetros de rastreamento comuns que não mudam o conteúdo.
      const tracking = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content'];
      tracking.forEach((p) => parsed.searchParams.delete(p));
      parsed.hash = '';
      return `${parsed.origin}${parsed.pathname}${parsed.search}`.toLowerCase();
    } catch {
      return url.trim().toLowerCase();
    }
  }
}
