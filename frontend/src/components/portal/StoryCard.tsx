import Link from 'next/link';
import { IMPACT_META, timeAgo } from '@/lib/portal';
import { cn } from '@/lib/utils';
import type { NewsItem } from '@/lib/types';

/** Etiqueta de categoria (kicker) no topo do card. */
function Kicker({ category }: { category: string | null }) {
  if (!category) return null;
  return (
    <span className="text-xs font-bold uppercase tracking-wide text-primary">{category}</span>
  );
}

function Meta({ item }: { item: NewsItem }) {
  const ago = timeAgo(item.publishedAt);
  const meta = IMPACT_META[item.impact ?? 'neutro'];
  return (
    <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
      {item.impact && (
        <span
          className={cn(
            'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 font-medium',
            meta.pill,
          )}
        >
          <span className={cn('h-1.5 w-1.5 rounded-full', meta.dot)} />
          {meta.label}
        </span>
      )}
      <span className="font-medium text-foreground/70">{item.source}</span>
      {ago && <span>· {ago}</span>}
    </div>
  );
}

/** Imagem da notícia com proporção fixa (esconde se não houver). */
function Thumb({ src, className }: { src: string | null; className?: string }) {
  if (!src) return null;
  return (
    <div className={cn('overflow-hidden rounded-md bg-muted', className)}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt=""
        loading="lazy"
        className="h-full w-full object-cover transition group-hover:scale-[1.02]"
      />
    </div>
  );
}

/** Manchete principal (lead) — destaque grande no topo da home. */
export function LeadStory({ item, summary }: { item: NewsItem; summary?: string | null }) {
  const standfirst = summary ?? item.justification;
  return (
    <Link
      href={`/noticia/${item.id}`}
      className="group flex h-full flex-col overflow-hidden rounded-lg border border-border bg-white transition hover:shadow-md"
    >
      <Thumb src={item.imageUrl} className="aspect-[16/9] w-full" />
      <div className="flex flex-1 flex-col p-6">
        <Kicker category={item.category} />
        <h2 className="mt-2 font-serif text-3xl font-bold leading-tight tracking-tight text-foreground group-hover:text-primary md:text-4xl">
          {item.title}
        </h2>
        {standfirst && (
          <p className="mt-3 max-w-2xl text-base leading-relaxed text-muted-foreground">
            {standfirst}
          </p>
        )}
        <div className="mt-auto pt-4">
          <Meta item={item} />
        </div>
      </div>
    </Link>
  );
}

/** Card padrão do grid. */
export function StoryCard({ item }: { item: NewsItem }) {
  return (
    <Link
      href={`/noticia/${item.id}`}
      className="group flex flex-col overflow-hidden rounded-lg border border-border bg-white transition hover:shadow-md"
    >
      <Thumb src={item.imageUrl} className="aspect-[16/9] w-full" />
      <div className="flex flex-1 flex-col p-4">
        <Kicker
          category={
            item.category ??
            (item.track === 'watchlist' ? 'ANVISA' : item.track === 'fidc' ? 'Mercado FIDC' : null)
          }
        />
        <h3 className="mt-1 font-serif text-lg font-bold leading-snug tracking-tight text-foreground group-hover:text-primary">
          {item.title}
        </h3>
        <div className="mt-auto">
          <Meta item={item} />
        </div>
      </div>
    </Link>
  );
}
