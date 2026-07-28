export type Impact = 'positivo' | 'negativo' | 'neutro';

/** Espelha o NewsFeedItem retornado por GET /api/news no backend. */
export interface NewsItem {
  id: string;
  title: string;
  summary: string | null;
  url: string;
  imageUrl: string | null;
  source: string;
  sourceType: string;
  track: string; // 'news' | 'watchlist'
  publishedAt: string | null;
  impact: Impact | null;
  relevance: number | null;
  category: string | null;
  justification: string | null;
  hasAnalysis: boolean;
}

export interface NewsResponse {
  items: NewsItem[];
  count: number;
}

/** Análise profunda por área (conteúdo do portal). */
export interface NewsAnalysis {
  executiveSummary: string;
  areas: Partial<Record<'comercial' | 'cobranca' | 'operacoes' | 'risco' | 'compliance', string>>;
  actions: string[];
  sourceRead: boolean;
}

/** Detalhe da notícia: espelha GET /api/news/:id. */
export interface NewsDetail extends NewsItem {
  analysis: NewsAnalysis | null;
}

// ---------------------------------------------------------------------------
// Dashboard de custos (espelha GET /api/costs). USD é ESTIMATIVA.
// ---------------------------------------------------------------------------
export interface CostTotals {
  calls: number;
  tokensInput: number;
  tokensOutput: number;
  tokensCacheRead: number;
  tokensCacheWrite: number;
  usd: number;
}

export interface DailyCost {
  day: string; // YYYY-MM-DD
  calls: number;
  tokensInput: number;
  tokensOutput: number;
  usd: number;
}

export interface ModelCost {
  calls: number;
  tokensInput: number;
  tokensOutput: number;
  usd: number;
}

export interface CycleCost {
  periodKey: string;
  startedAt: string;
  finishedAt: string | null;
  status: string;
  calls: number;
  tokensInput: number;
  tokensOutput: number;
  tokensCacheRead: number;
  tokensCacheWrite: number;
  usd: number;
  byModel: Record<string, ModelCost>;
}

export interface CostReport {
  totals: CostTotals;
  daily: DailyCost[];
  cycles: CycleCost[];
}
