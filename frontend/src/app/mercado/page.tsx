import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { fetchNews } from '@/lib/api';
import { StoryCard } from '@/components/portal/StoryCard';
import type { NewsItem } from '@/lib/types';

export const dynamic = 'force-dynamic';

export default async function MercadoPage() {
  let items: NewsItem[] = [];
  let error: string | null = null;
  try {
    const res = await fetchNews({ track: 'fidc', limit: 60 });
    items = res.items.filter((i) => i.hasAnalysis);
  } catch (e) {
    error = (e as Error).message;
  }

  return (
    <main className="mx-auto max-w-6xl px-4 py-8">
      <Link
        href="/"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-primary"
      >
        <ArrowLeft className="h-4 w-4" /> Início
      </Link>

      <h1 className="mb-2 mt-4 font-serif text-3xl font-bold tracking-tight">
        Mercado FIDC & Regulação
      </h1>
      <p className="mb-6 max-w-3xl text-sm text-muted-foreground">
        Monitoramento do segmento: FIDCs, factoring e securitizadoras, movimentos de concorrentes e
        regulação (CVM, BACEN, CMN). Inteligência de mercado para a Audax como operadora de FIDC.
      </p>

      {error && (
        <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {!error && items.length === 0 && (
        <div className="rounded-lg border border-border bg-white px-6 py-16 text-center">
          <p className="text-lg font-medium">Sem notícias do segmento no período.</p>
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {items.map((item) => (
          <StoryCard key={item.id} item={item} />
        ))}
      </div>
    </main>
  );
}
