'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { Filters } from '@/components/Filters';
import { NewsTable } from '@/components/NewsTable';
import { RelevanceChart } from '@/components/RelevanceChart';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { fetchCategories, fetchNews, triggerCycle } from '@/lib/api';
import type { NewsItem } from '@/lib/types';

/** Data de hoje (YYYY-MM-DD) no fuso de São Paulo. */
function todayInSaoPaulo(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

export default function PainelPage() {
  const [date, setDate] = useState<string>(todayInSaoPaulo());
  const [category, setCategory] = useState<string>('');
  const [categories, setCategories] = useState<string[]>([]);
  const [items, setItems] = useState<NewsItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [triggering, setTriggering] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [news, cats] = await Promise.all([
        fetchNews({ date, category: category || undefined }),
        fetchCategories(),
      ]);
      setItems(news.items);
      setCategories(cats);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [date, category]);

  useEffect(() => {
    void load();
  }, [load]);

  const stats = useMemo(() => {
    const classified = items.filter((i) => i.impact);
    return {
      total: items.length,
      positivo: classified.filter((i) => i.impact === 'positivo').length,
      negativo: classified.filter((i) => i.impact === 'negativo').length,
      neutro: classified.filter((i) => i.impact === 'neutro').length,
    };
  }, [items]);

  const onTrigger = async () => {
    setTriggering(true);
    try {
      await triggerCycle();
      setTimeout(() => void load(), 4000);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setTriggering(false);
    }
  };

  return (
    <main className="mx-auto max-w-5xl px-4 py-8">
      <header className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">📡 Painel — Radar de Notícias</h1>
          <p className="text-sm text-muted-foreground">
            Audax Capital — impacto para a FIDC de recebíveis agro
          </p>
        </div>
        <Button onClick={onTrigger} disabled={triggering}>
          <RefreshCw className={`h-4 w-4 ${triggering ? 'animate-spin' : ''}`} />
          {triggering ? 'Disparando...' : 'Coletar agora'}
        </Button>
      </header>

      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard label="Total" value={stats.total} />
        <StatCard label="🟢 Positivas" value={stats.positivo} />
        <StatCard label="🔴 Negativas" value={stats.negativo} />
        <StatCard label="⚪ Neutras" value={stats.neutro} />
      </div>

      <Card className="mb-6">
        <CardHeader>
          <CardTitle>Relevância média por categoria</CardTitle>
        </CardHeader>
        <CardContent>
          <RelevanceChart items={items} />
        </CardContent>
      </Card>

      <div className="mb-4 flex flex-wrap items-end justify-between gap-4">
        <Filters
          date={date}
          category={category}
          categories={categories}
          onDateChange={setDate}
          onCategoryChange={setCategory}
        />
        {loading && <span className="text-sm text-muted-foreground">Carregando…</span>}
      </div>

      {error && (
        <div className="mb-4 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error} — verifique se o backend está no ar (NEXT_PUBLIC_API_URL).
        </div>
      )}

      <NewsTable items={items} />
    </main>
  );
}

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <Card>
      <CardContent className="p-4">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="text-2xl font-bold tabular-nums">{value}</p>
      </CardContent>
    </Card>
  );
}
