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
  let watchItems: NewsItem[] = [];
  let error: string | null = null;
  try {
    // Notícias do dia (curadoria) + alertas de vigilância (ANVISA) à parte —
    // estes têm janela de 30 dias, então não são filtrados por "hoje".
    const [newsRes, watchRes] = await Promise.all([
      fetchNews({ date: todayInSaoPaulo(), category }),
      fetchNews({ track: 'watchlist', limit: 12 }),
    ]);
    newsItems = newsRes.items.filter((i) => i.hasAnalysis && i.track !== 'watchlist');
    watchItems = watchRes.items.filter((i) => i.hasAnalysis);
  } catch (e) {
    error = (e as Error).message;
  }

  const [lead, ...rest] = newsItems;
  const totalCount = newsItems.length + watchItems.length;

  // Na manchete, usa o resumo executivo da análise (texto mais encorpado) —
  // cai para a justificativa curta se a análise ainda não existir.
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
        <span className="text-sm text-muted-foreground">{totalCount} notícias hoje</span>
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

      {watchItems.length > 0 && (
        <section className="mb-8 rounded-lg border border-red-200 bg-red-50/50 p-5">
          <h2 className="mb-4 flex items-center gap-2 font-serif text-xl font-bold tracking-tight text-red-700">
            ⚠️ Alertas Regulatórios (ANVISA)
          </h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {watchItems.map((item) => (
              <StoryCard key={item.id} item={item} />
            ))}
          </div>
        </section>
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

      {rest.length > 3 && (
        <>
          <h2 className="mb-4 mt-10 border-b border-border pb-2 font-serif text-xl font-bold tracking-tight">
            Mais notícias
          </h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {rest.slice(3).map((item) => (
              <StoryCard key={item.id} item={item} />
            ))}
          </div>
        </>
      )}
    </main>
  );
}
