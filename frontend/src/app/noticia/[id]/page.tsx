import Link from 'next/link';
import { notFound } from 'next/navigation';
import {
  ArrowLeft,
  Briefcase,
  Cog,
  ExternalLink,
  Lock,
  Scale,
  ShieldAlert,
  Wallet,
  type LucideIcon,
} from 'lucide-react';
import { fetchNewsDetail } from '@/lib/api';
import { IMPACT_META, formatDateBR } from '@/lib/portal';
import { cn } from '@/lib/utils';
import { NewsChat } from '@/components/portal/NewsChat';

export const dynamic = 'force-dynamic';

const AREAS: { key: 'comercial' | 'cobranca' | 'operacoes' | 'risco' | 'compliance'; label: string; Icon: LucideIcon }[] = [
  { key: 'comercial', label: 'Comercial / Originação', Icon: Briefcase },
  { key: 'cobranca', label: 'Cobrança', Icon: Wallet },
  { key: 'operacoes', label: 'Operações', Icon: Cog },
  { key: 'risco', label: 'Risco / Crédito', Icon: ShieldAlert },
  { key: 'compliance', label: 'Compliance / Jurídico', Icon: Scale },
];

export default async function NoticiaPage({ params }: { params: { id: string } }) {
  const item = await fetchNewsDetail(params.id);
  if (!item) notFound();

  const impact = IMPACT_META[item.impact ?? 'neutro'];
  const data = formatDateBR(item.publishedAt);
  const analysis = item.analysis;

  return (
    <main className="mx-auto max-w-3xl px-4 py-8">
      <Link
        href="/"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-primary"
      >
        <ArrowLeft className="h-4 w-4" /> Voltar
      </Link>

      <article className="mt-4">
        <div className="flex flex-wrap items-center gap-2">
          {item.category && (
            <span className="text-xs font-bold uppercase tracking-wide text-primary">
              {item.category}
            </span>
          )}
          {item.impact && (
            <span
              className={cn(
                'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium',
                impact.pill,
              )}
            >
              <span className={cn('h-1.5 w-1.5 rounded-full', impact.dot)} />
              {impact.label}
              {item.relevance != null && <span className="opacity-70">· {item.relevance}</span>}
            </span>
          )}
        </div>

        <h1 className="mt-3 font-serif text-3xl font-bold leading-tight tracking-tight md:text-4xl">
          {item.title}
        </h1>

        <p className="mt-3 text-sm text-muted-foreground">
          <span className="font-medium text-foreground/80">{item.source}</span>
          {data && <> · {data}</>}
        </p>

        {item.imageUrl && (
          <div className="mt-6 overflow-hidden rounded-lg bg-muted">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={item.imageUrl}
              alt=""
              className="aspect-[16/9] w-full object-cover"
            />
          </div>
        )}

        {/* Análise Audax */}
        {analysis ? (
          <div className="mt-8">
            <h2 className="font-serif text-xl font-bold tracking-tight">Análise Audax</h2>
            <p className="mt-2 border-l-4 border-primary pl-4 text-lg leading-relaxed text-foreground/90">
              {analysis.executiveSummary}
            </p>

            <h3 className="mt-8 font-serif text-lg font-bold tracking-tight">
              O que significa para cada área
            </h3>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              {AREAS.map(({ key, label, Icon }) => {
                const text = analysis.areas[key];
                if (!text) return null;
                return (
                  <div key={key} className="rounded-lg border border-border bg-white p-4">
                    <div className="flex items-center gap-2 text-sm font-semibold text-primary">
                      <Icon className="h-4 w-4" />
                      {label}
                    </div>
                    <p className="mt-2 text-sm leading-relaxed text-foreground/80">{text}</p>
                  </div>
                );
              })}
            </div>

            {analysis.actions.length > 0 && (
              <div className="mt-8">
                <h3 className="font-serif text-lg font-bold tracking-tight">Ações sugeridas</h3>
                <ul className="mt-3 space-y-2">
                  {analysis.actions.map((a, i) => (
                    <li key={i} className="flex gap-2 text-sm leading-relaxed text-foreground/80">
                      <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
                      {a}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {!analysis.sourceRead && (
              <p className="mt-6 inline-flex items-center gap-1 rounded-md bg-amber-50 px-3 py-1.5 text-xs text-amber-700">
                <Lock className="h-3.5 w-3.5" /> Análise baseada apenas no título (fonte paga ou
                texto inacessível).
              </p>
            )}
          </div>
        ) : (
          <div className="mt-8 rounded-lg border border-border bg-muted/40 p-4">
            <p className="text-sm text-muted-foreground">
              {item.justification
                ? item.justification
                : 'Análise detalhada ainda não disponível para esta notícia.'}
            </p>
          </div>
        )}

        {/* Fonte original */}
        <div className="mt-10 border-t border-border pt-6">
          <a
            href={item.url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition hover:opacity-90"
          >
            Ler na fonte original <ExternalLink className="h-4 w-4" />
          </a>
          <p className="mt-2 text-xs text-muted-foreground">{item.source}</p>
        </div>

        <NewsChat id={item.id} />
      </article>
    </main>
  );
}
