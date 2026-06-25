import { Badge } from './ui/badge';
import type { Impact } from '@/lib/types';

const LABEL: Record<Impact, string> = {
  positivo: '🟢 Positivo',
  negativo: '🔴 Negativo',
  neutro: '⚪ Neutro',
};

export function ImpactBadge({ impact }: { impact: Impact | null }) {
  if (!impact) return <Badge variant="default">Sem classificação</Badge>;
  return <Badge variant={impact}>{LABEL[impact]}</Badge>;
}
