import type { NewsDetail, NewsResponse } from './types';

/**
 * Base da API. Duas origens:
 *  - SERVIDOR (SSR): usa API_URL_INTERNAL (ex.: http://backend:3333 na rede do
 *    compose); cai para a pública se não houver.
 *  - CLIENTE (browser): usa NEXT_PUBLIC_API_URL (embutida no build). Em produção
 *    fica vazia → mesma origem, e o Nginx roteia /api → backend. Em dev, aponta
 *    para http://localhost:3333.
 */
const PUBLIC_API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3333';

function apiBase(): string {
  if (typeof window === 'undefined') {
    return process.env.API_URL_INTERNAL || PUBLIC_API_URL;
  }
  return PUBLIC_API_URL;
}
const API_URL = apiBase();

export interface NewsFilters {
  date?: string;
  category?: string;
  track?: 'news' | 'watchlist' | 'fidc';
  limit?: number;
}

export async function fetchNews(filters: NewsFilters): Promise<NewsResponse> {
  const params = new URLSearchParams();
  if (filters.date) params.set('date', filters.date);
  if (filters.category) params.set('category', filters.category);
  if (filters.track) params.set('track', filters.track);
  if (filters.limit) params.set('limit', String(filters.limit));

  const res = await fetch(`${API_URL}/api/news?${params.toString()}`, { cache: 'no-store' });
  if (!res.ok) throw new Error(`Falha ao carregar notícias (HTTP ${res.status}).`);
  return res.json();
}

export async function fetchNewsDetail(id: string): Promise<NewsDetail | null> {
  const res = await fetch(`${API_URL}/api/news/${id}`, { cache: 'no-store' });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Falha ao carregar notícia (HTTP ${res.status}).`);
  return res.json();
}

export async function fetchCategories(): Promise<string[]> {
  const res = await fetch(`${API_URL}/api/news/categories`, { cache: 'no-store' });
  if (!res.ok) return [];
  const data = (await res.json()) as { categories: string[] };
  return data.categories ?? [];
}

/** Dispara um ciclo manual (202). */
export async function triggerCycle(): Promise<void> {
  const res = await fetch(`${API_URL}/api/trigger`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({}),
  });
  if (!res.ok && res.status !== 202) {
    throw new Error(`Falha ao disparar coleta (HTTP ${res.status}).`);
  }
}
