import type { Article } from '../../../collection/domain/entities/Article.js';
import type { Classification } from '../entities/Classification.js';
import type { Impact } from '../value-objects/Impact.js';

export interface ScoredArticle {
  article: Article;
  classification: Classification;
}

const IMPACT_EMOJI: Record<Impact, string> = {
  positivo: '✅',
  negativo: '⚠️',
  neutro: '▪️',
};

/** Data/hora de publicação em horário de Brasília (DD/MM/AAAA HH:MM) ou null. */
export function formatPublishedAtBR(date: Date | null): string | null {
  if (!date) return null;
  try {
    return new Intl.DateTimeFormat('pt-BR', {
      timeZone: 'America/Sao_Paulo',
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
      .format(date)
      .replace(',', '');
  } catch {
    return null;
  }
}

/**
 * ExecutiveSummaryBuilder — serviço de domínio puro.
 *
 * Seleciona as notícias de maior relevância (acima do piso) e monta a mensagem
 * determinística para WhatsApp (PT-BR): título ORIGINAL da fonte, categoria,
 * emoji de impacto, data de publicação e URL. É a fonte ÚNICA do texto enviado
 * — não passamos pelo LLM, para não reescrever os títulos reais.
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
   * O que vai ao CEO (e ao portal): aplica o PISO de relevância e o TETO de
   * itens (maiores relevâncias primeiro). Pode retornar lista vazia num dia
   * sem nada relevante — nesse caso não há resumo a disparar.
   */
  selectTop(scored: ScoredArticle[]): ScoredArticle[] {
    return [...scored]
      .filter((s) => s.classification.relevance >= this.minRelevance)
      .sort((a, b) => b.classification.relevance - a.classification.relevance)
      .slice(0, this.maxItems);
  }

  /** Monta o texto final (determinístico) a partir do top selecionado. */
  buildMessage(top: ScoredArticle[]): string {
    const header = '*Audax Capital | Notícias — Agro & Crédito*';
    // Cada notícia: impacto + categoria + título; data/hora (se houver); URL.
    const blocks = top.map((s) => {
      const emoji = IMPACT_EMOJI[s.classification.impact];
      const cat = s.classification.category;
      const data = formatPublishedAtBR(s.article.publishedAt);
      const dateLine = data ? `🗓️ ${data}\n` : '';
      return `${emoji} *${cat}* — ${s.article.title.trim()}\n${dateLine}${s.article.url}`;
    });
    return [header, '', blocks.join('\n\n')].join('\n');
  }
}
