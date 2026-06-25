import type { Article } from '../../../collection/domain/entities/Article.js';
import type { Classification } from '../entities/Classification.js';
import type { Impact } from '../value-objects/Impact.js';

export interface ScoredArticle {
  article: Article;
  classification: Classification;
}

const IMPACT_EMOJI: Record<Impact, string> = {
  positivo: '🟢',
  negativo: '🔴',
  neutro: '⚪',
};

/**
 * ExecutiveSummaryBuilder — serviço de domínio puro.
 *
 * Seleciona as 3-5 notícias de maior relevância do lote e produz um texto
 * determinístico pronto para WhatsApp (PT-BR, curto, uma linha por notícia,
 * emojis discretos de sinalização). Serve como fallback caso a geração via
 * LLM falhe, garantindo que SEMPRE haja um resumo para disparar.
 */
export class ExecutiveSummaryBuilder {
  static readonly MIN = 3;
  static readonly MAX = 5;

  /** Top N por relevância (desc). Usado tanto p/ o prompt quanto p/ o fallback. */
  selectTop(scored: ScoredArticle[]): ScoredArticle[] {
    return [...scored]
      .sort((a, b) => b.classification.relevance - a.classification.relevance)
      .slice(0, ExecutiveSummaryBuilder.MAX);
  }

  /** Texto determinístico (fallback) a partir do top selecionado. */
  buildFallbackText(top: ScoredArticle[], webAppUrl: string): string {
    const header = '📊 *Radar de Notícias Audax* — resumo executivo';
    const lines = top.map((s) => {
      const emoji = IMPACT_EMOJI[s.classification.impact];
      const rel = s.classification.relevance;
      return `${emoji} *(${rel})* ${s.article.title.trim()}`;
    });
    const footer = `\n🔗 Análise completa: ${webAppUrl}`;
    return [header, '', ...lines, footer].join('\n');
  }
}
