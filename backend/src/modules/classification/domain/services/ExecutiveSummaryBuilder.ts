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
   * Relevantes: acima do piso, ordenadas por relevância (desc), SEM teto.
   * É o conjunto do portal (análise profunda de cada uma).
   */
  selectRelevant(scored: ScoredArticle[]): ScoredArticle[] {
    return [...scored]
      .filter((s) => s.classification.relevance >= this.minRelevance)
      .sort((a, b) => b.classification.relevance - a.classification.relevance);
  }

  /**
   * O que vai ao CEO no WhatsApp: as relevantes, limitadas ao TETO de itens.
   * Pode retornar lista vazia num dia sem nada relevante.
   */
  selectTop(scored: ScoredArticle[]): ScoredArticle[] {
    return this.selectRelevant(scored).slice(0, this.maxItems);
  }

  /**
   * Monta o texto final (determinístico). O link de cada notícia aponta para o
   * PORTAL da Audax (`webAppUrl/noticia/:id`) — onde está a análise por área e o
   * link da fonte —, não direto para o veículo.
   */
  buildMessage(top: ScoredArticle[], webAppUrl: string): string {
    const base = webAppUrl.replace(/\/+$/, '');
    const header = '*Audax Capital | Notícias — Agro & Crédito*';
    // Cada notícia: impacto + categoria + título; data/hora (se houver); link do portal.
    const blocks = top.map((s) => {
      const emoji = IMPACT_EMOJI[s.classification.impact];
      const cat = s.classification.category;
      const data = formatPublishedAtBR(s.article.publishedAt);
      const dateLine = data ? `🗓️ ${data}\n` : '';
      const portalUrl = `${base}/noticia/${s.article.id}`;
      return `${emoji} *${cat}* — ${s.article.title.trim()}\n${dateLine}${portalUrl}`;
    });
    return [header, '', blocks.join('\n\n')].join('\n');
  }
}
