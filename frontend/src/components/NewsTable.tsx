import { ExternalLink } from 'lucide-react';
import { ImpactBadge } from './ImpactBadge';
import { Badge } from './ui/badge';
import type { NewsItem } from '@/lib/types';

function formatDate(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function RelevanceMeter({ value }: { value: number | null }) {
  if (value == null) return <span className="text-muted-foreground">—</span>;
  const color = value >= 70 ? 'bg-red-500' : value >= 40 ? 'bg-amber-500' : 'bg-slate-400';
  return (
    <div className="flex items-center gap-2">
      <div className="h-1.5 w-16 rounded-full bg-muted">
        <div className={`h-1.5 rounded-full ${color}`} style={{ width: `${value}%` }} />
      </div>
      <span className="tabular-nums text-xs font-medium">{value}</span>
    </div>
  );
}

/** Lista de notícias do dia: impacto, relevância, fonte, data, resumo e link. */
export function NewsTable({ items }: { items: NewsItem[] }) {
  if (items.length === 0) {
    return (
      <div className="rounded-lg border border-dashed p-10 text-center text-sm text-muted-foreground">
        Nenhuma notícia para os filtros selecionados.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {items.map((item) => (
        <article
          key={item.id}
          className="rounded-lg border bg-card p-4 shadow-sm transition-shadow hover:shadow-md"
        >
          <div className="flex flex-wrap items-center gap-2">
            <ImpactBadge impact={item.impact} />
            {item.category && <Badge variant="default">{item.category}</Badge>}
            <RelevanceMeter value={item.relevance} />
            <span className="ml-auto text-xs text-muted-foreground">{formatDate(item.publishedAt)}</span>
          </div>

          <h3 className="mt-2 font-semibold leading-snug">
            <a
              href={item.url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-start gap-1 hover:underline"
            >
              {item.title}
              <ExternalLink className="mt-1 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
            </a>
          </h3>

          {item.summary && (
            <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{item.summary}</p>
          )}

          {item.justification && (
            <p className="mt-2 rounded-md bg-muted px-3 py-2 text-sm">
              <span className="font-medium">Impacto p/ FIDC: </span>
              {item.justification}
            </p>
          )}

          <p className="mt-2 text-xs text-muted-foreground">Fonte: {item.source}</p>
        </article>
      ))}
    </div>
  );
}
