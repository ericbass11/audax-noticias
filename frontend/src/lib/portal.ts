import type { Impact } from './types';

/** Metadados visuais do impacto para a FIDC (cores e rótulo). */
export const IMPACT_META: Record<
  Impact,
  { label: string; dot: string; pill: string }
> = {
  negativo: {
    label: 'Risco',
    dot: 'bg-red-600',
    pill: 'bg-red-50 text-red-700 border-red-200',
  },
  positivo: {
    label: 'Positivo',
    dot: 'bg-emerald-600',
    pill: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  },
  neutro: {
    label: 'Neutro',
    dot: 'bg-slate-400',
    pill: 'bg-slate-100 text-slate-600 border-slate-200',
  },
};

/** Data/hora em horário de Brasília — ex.: "26 jun 2026, 08:14". */
export function formatDateBR(iso: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return new Intl.DateTimeFormat('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
    .format(d)
    .replace('.', '');
}

/** Tempo relativo curto — ex.: "há 3 h", "há 2 d". */
export function timeAgo(iso: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso).getTime();
  if (Number.isNaN(d)) return null;
  const diffMin = Math.round((Date.now() - d) / 60000);
  if (diffMin < 1) return 'agora';
  if (diffMin < 60) return `há ${diffMin} min`;
  const h = Math.round(diffMin / 60);
  if (h < 24) return `há ${h} h`;
  const dias = Math.round(h / 24);
  return `há ${dias} d`;
}
