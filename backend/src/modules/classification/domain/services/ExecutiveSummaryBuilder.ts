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
  /**
   * @param minRelevance piso: só entram notícias com relevância >= este valor.
   * @param maxItems teto de itens no resumo (evita "entupir" o WhatsApp).
   */
  constructor(
    private readonly minRelevance = 0,
    private readonly maxItems = 5,
  ) {}

  /**
   * Seleciona o que vai ao CEO: aplica o PISO de relevância e então o TETO de
   * itens (maiores relevâncias primeiro). Pode retornar lista vazia num dia
   * sem nada relevante — nesse caso não há resumo a disparar.
   */
  selectTop(scored: ScoredArticle[]): ScoredArticle[] {
    return [...scored]
      .filter((s) => s.classification.relevance >= this.minRelevance)
      .sort((a, b) => b.classification.relevance - a.classification.relevance)
      .slice(0, this.maxItems);
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
