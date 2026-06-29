import Link from 'next/link';
import { fetchNews, fetchNewsDetail } from '@/lib/api';
import { LeadStory, StoryCard } from '@/components/portal/StoryCard';
import type { NewsItem } from '@/lib/types';

export const dynamic = 'force-dynamic';

function todayInSaoPaulo(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

export default async function PortalHome({
  searchParams,
}: {
  searchParams: { categoria?: string };
}) {
  const category = searchParams.categoria;

  let newsItems: NewsItem[] = [];
  let latestWatch: NewsItem | null = null;
  let error: string | null = null;
  try {
    // Notícias do dia (curadoria) + o alerta ANVISA mais recente (rota própria,
    // janela de 30 dias). A lista completa de alertas fica em /alertas.
    const [newsRes, watchRes] = await Promise.all([
      fetchNews({ date: todayInSaoPaulo(), category }),
      fetchNews({ track: 'watchlist', limit: 10 }),
    ]);
    newsItems = newsRes.items.filter((i) => i.hasAnalysis && i.track !== 'watchlist');
    // O mais recente JÁ analisado (ignora duplicatas descartadas, sem análise).
    latestWatch = watchRes.items.filter((i) => i.hasAnalysis)[0] ?? null;
  } catch (e) {
    error = (e as Error).message;
  }

  const [lead, ...rest] = newsItems;
  // O alerta ANVISA mais recente entra junto das demais notícias.
  const moreItems = [...(latestWatch ? [latestWatch] : []), ...rest.slice(3)];
  const totalCount = newsItems.length + (latestWatch ? 1 : 0);

  // Na manchete, usa o resumo executivo da análise (texto mais encorpado).
  let leadSummary: string | null = lead?.justification ?? null;
  if (lead) {
    try {
      const detail = await fetchNewsDetail(lead.id);
      if (detail?.analysis?.executiveSummary) leadSummary = detail.analysis.executiveSummary;
    } catch {
      /* mantém a justificativa */
    }
  }

  return (
    <main className="mx-auto max-w-6xl px-4 py-8">
      <div className="mb-6 flex items-baseline justify-between border-b border-border pb-3">
        <h1 className="font-serif text-2xl font-bold tracking-tight">
          {category ? category : 'Principais notícias'}
        </h1>
        <Link href="/alertas" className="text-sm font-medium text-red-700 hover:underline">
          ⚠️ Alertas ANVISA
        </Link>
      </div>

      {error && (
        <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error} — verifique se o backend está no ar (NEXT_PUBLIC_API_URL).
        </div>
      )}

      {!error && totalCount === 0 && (
        <div className="rounded-lg border border-border bg-white px-6 py-16 text-center">
          <p className="text-lg font-medium">Nenhuma notícia classificada hoje ainda.</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Os ciclos rodam às 08h e 18h (BRT). Volte mais tarde.
          </p>
        </div>
      )}

      {lead && (
        <div className="grid gap-6 lg:grid-cols-3">
          <div className="lg:col-span-2">
            <LeadStory item={lead} summary={leadSummary} />
          </div>
          <aside className="flex flex-col gap-4">
            {rest.slice(0, 3).map((item) => (
              <StoryCard key={item.id} item={item} />
            ))}
          </aside>
        </div>
      )}

      {moreItems.length > 0 && (
        <>
          <h2 className="mb-4 mt-10 border-b border-border pb-2 font-serif text-xl font-bold tracking-tight">
            Mais notícias
          </h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {moreItems.map((item) => (
              <StoryCard key={item.id} item={item} />
            ))}
          </div>
        </>
      )}
    </main>
  );
}
