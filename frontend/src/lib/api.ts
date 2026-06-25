import type { NewsResponse } from './types';

/**
 * Cliente da API do backend. O frontend consome o mesmo Postgres VIA a API
 * REST (não conecta direto no banco). A URL base vem de NEXT_PUBLIC_API_URL.
 */
const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3333';

export interface NewsFilters {
  date?: string;
  category?: string;
}

export async function fetchNews(filters: NewsFilters): Promise<NewsResponse> {
  const params = new URLSearchParams();
  if (filters.date) params.set('date', filters.date);
  if (filters.category) params.set('category', filters.category);

  const res = await fetch(`${API_URL}/api/news?${params.toString()}`, { cache: 'no-store' });
  if (!res.ok) throw new Error(`Falha ao carregar notícias (HTTP ${res.status}).`);
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
