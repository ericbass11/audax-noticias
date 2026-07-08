export interface CommodityQuote {
  label: string;
  unit: string;
  date: string; // DD/MM/AAAA
  value: string; // ex.: "139,71" ou "1.737,76"
  variation: string; // ex.: "+0,50" ou "-2,78"
}

interface CommodityConfig {
  label: string;
  slug: string;
  unit: string;
}

/**
 * Indicadores CEPEA/ESALQ dos 4 principais (referência do agro brasileiro).
 * Boi Gordo é R$/arroba; grãos e café são R$/saca 60kg.
 */
const COMMODITIES: CommodityConfig[] = [
  { label: 'Soja', slug: 'soja', unit: 'sc 60kg' },
  { label: 'Milho', slug: 'milho', unit: 'sc 60kg' },
  { label: 'Café', slug: 'cafe', unit: 'sc 60kg' },
  { label: 'Boi Gordo', slug: 'boi-gordo', unit: '@' },
];

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';

/**
 * CommodityQuotesFetcher — captura (best-effort) o preço e a variação diária de
 * SOJA, MILHO, CAFÉ e BOI GORDO a partir das páginas de cotação (indicadores
 * CEPEA/ESALQ via Notícias Agrícolas). Fonte gratuita e não-oficial: se o site
 * mudar o HTML, o parse pode falhar — nesse caso o item é omitido, sem derrubar
 * os demais. Trocar por um provedor oficial depois é só reimplementar fetch().
 */
export class CommodityQuotesFetcher {
  constructor(
    private readonly baseUrl = 'https://www.noticiasagricolas.com.br/cotacoes',
    private readonly timeoutMs = 15000,
  ) {}

  async fetch(): Promise<CommodityQuote[]> {
    const results = await Promise.allSettled(COMMODITIES.map((c) => this.fetchOne(c)));
    const quotes: CommodityQuote[] = [];
    results.forEach((r, i) => {
      if (r.status === 'fulfilled' && r.value) quotes.push(r.value);
      else if (r.status === 'rejected') {
        console.error(`⚠️  Cotação "${COMMODITIES[i]?.label}" falhou:`, r.reason?.message ?? r.reason);
      }
    });
    return quotes;
  }

  private async fetchOne(c: CommodityConfig): Promise<CommodityQuote | null> {
    const res = await fetch(`${this.baseUrl}/${c.slug}`, {
      headers: { 'user-agent': UA, 'accept-language': 'pt-BR' },
      signal: AbortSignal.timeout(this.timeoutMs),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const text = (await res.text())
      .replace(/<script[\s\S]*?<\/script>/g, ' ')
      .replace(/<[^>]+>/g, ' ')
      .replace(/&[a-z]+;/g, ' ')
      .replace(/\s+/g, ' ');

    // Âncora estável: "... Variação (%) DD/MM/AAAA <valor> <variação>"
    const m = text.match(
      /Varia[çc][ãa]o\s*\(%\)\s*(\d{2}\/\d{2}\/\d{4})\s*([\d.]+,\d{2})\s*([+-]?\d+,\d+)/,
    );
    if (!m) return null;
    return { label: c.label, unit: c.unit, date: m[1]!, value: m[2]!, variation: m[3]! };
  }
}
