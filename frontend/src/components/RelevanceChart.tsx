'use client';

import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { NewsItem } from '@/lib/types';

const IMPACT_COLOR: Record<string, string> = {
  positivo: '#16a34a',
  negativo: '#dc2626',
  neutro: '#94a3b8',
};

/**
 * Relevância média por categoria, colorida pelo impacto predominante.
 * Dá ao C-Level uma leitura rápida de onde está o risco/oportunidade do dia.
 */
export function RelevanceChart({ items }: { items: NewsItem[] }) {
  const byCategory = new Map<string, { total: number; count: number; impacts: Record<string, number> }>();

  for (const item of items) {
    if (!item.category || item.relevance == null) continue;
    const entry = byCategory.get(item.category) ?? { total: 0, count: 0, impacts: {} };
    entry.total += item.relevance;
    entry.count += 1;
    if (item.impact) entry.impacts[item.impact] = (entry.impacts[item.impact] ?? 0) + 1;
    byCategory.set(item.category, entry);
  }

  const data = [...byCategory.entries()]
    .map(([category, e]) => {
      const dominant =
        Object.entries(e.impacts).sort((a, b) => b[1] - a[1])[0]?.[0] ?? 'neutro';
      return {
        category,
        relevancia: Math.round(e.total / e.count),
        dominant,
      };
    })
    .sort((a, b) => b.relevancia - a.relevancia);

  if (data.length === 0) {
    return <p className="text-sm text-muted-foreground">Sem dados classificados para o gráfico.</p>;
  }

  return (
    <ResponsiveContainer width="100%" height={260}>
      <BarChart data={data} margin={{ top: 8, right: 8, bottom: 8, left: -16 }}>
        <CartesianGrid strokeDasharray="3 3" vertical={false} />
        <XAxis dataKey="category" tick={{ fontSize: 12 }} interval={0} angle={-12} textAnchor="end" height={60} />
        <YAxis domain={[0, 100]} tick={{ fontSize: 12 }} />
        <Tooltip formatter={(v: number) => [`${v}`, 'Relevância média']} />
        <Bar dataKey="relevancia" radius={[4, 4, 0, 0]}>
          {data.map((d) => (
            <Cell key={d.category} fill={IMPACT_COLOR[d.dominant] ?? '#94a3b8'} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
