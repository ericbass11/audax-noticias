export type Impact = 'positivo' | 'negativo' | 'neutro';

/** Espelha o NewsFeedItem retornado por GET /api/news no backend. */
export interface NewsItem {
  id: string;
  title: string;
  summary: string | null;
  url: string;
  source: string;
  sourceType: string;
  publishedAt: string | null;
  impact: Impact | null;
  relevance: number | null;
  category: string | null;
  justification: string | null;
}

export interface NewsResponse {
  items: NewsItem[];
  count: number;
}
