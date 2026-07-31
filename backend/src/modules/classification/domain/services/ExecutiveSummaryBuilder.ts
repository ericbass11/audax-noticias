import type { Article } from '../../../collection/domain/entities/Article.js';
import type { Classification } from '../entities/Classification.js';
import type { Impact } from '../value-objects/Impact.js';

export interface ScoredArticle {
  article: Article;
  classification: Classification;
}

/** Item da rota de vigilância (ANVISA) para o bloco de alertas. */
export interface WatchlistMessageItem {
  id: string;
  title: string;
  url: string;
  publishedAt: Date | null;
  /**
   * Classificação, quando a rota passa por ela (hoje: FIDC). Ausente = a rota
   * não é classificada e o item sai no formato simples, como antes.
   */
  category?: string;
  impact?: Impact;
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
   * Digest simples de uma rota (ex.: Mercado FIDC): cabeçalho + lista de itens
   * (título, data, link da fonte). Usado no 2º fluxo de WhatsApp.
   */
  buildTrackDigest(header: string, items: WatchlistMessageItem[]): string {
    const blocks = items.map((i) => {
      const data = formatPublishedAtBR(i.publishedAt);
      const dateLine = data ? `🗓️ ${data}\n` : '';
      // Com classificação, usa o mesmo formato do digest do CEO (emoji de
      // impacto + categoria). SEM classificação, mantém o formato antigo —
      // então rota não classificada continua saindo idêntica ao que era.
      const prefix = i.category
        ? `${IMPACT_EMOJI[i.impact ?? 'neutro']} *${i.category}* — `
        : '▪️ ';
      return `${prefix}${i.title.trim()}\n${dateLine}${i.url}`;
    });
    return [`*${header}*`, '', blocks.join('\n\n')].join('\n');
  }

  /**
   * Monta o texto final (determinístico). O link de cada notícia aponta para a
   * FONTE original (abre no celular). Quando o portal estiver público, dá para
   * voltar a linkar para `webAppUrl/noticia/:id`.
   */
  buildMessage(
    top: ScoredArticle[],
    webAppUrl: string,
    watchlist: WatchlistMessageItem[] = [],
    disaster: WatchlistMessageItem[] = [],
  ): string {
    void webAppUrl; // reservado p/ quando o portal for público
    const header = '*Audax Capital | Notícias — Agro & Crédito*';
    const sections: string[] = [header];

    // Seção de notícias: impacto + categoria + título; data/hora; link da fonte.
    if (top.length > 0) {
      const blocks = top.map((s) => {
        const emoji = IMPACT_EMOJI[s.classification.impact];
        const cat = s.classification.category;
        const data = formatPublishedAtBR(s.article.publishedAt);
        const dateLine = data ? `🗓️ ${data}\n` : '';
        return `${emoji} *${cat}* — ${s.article.title.trim()}\n${dateLine}${s.article.url}`;
      });
      sections.push(blocks.join('\n\n'));
    }

    // Bloco de vigilância regulatória (ANVISA) — destacado.
    if (watchlist.length > 0) {
      const items = watchlist.map((w) => {
        const data = formatPublishedAtBR(w.publishedAt);
        const dateLine = data ? `🗓️ ${data}\n` : '';
        return `⛔ ${w.title.trim()}\n${dateLine}${w.url}`;
      });
      sections.push(['*⚠️ Alertas regulatórios (ANVISA)*', items.join('\n\n')].join('\n'));
    }

    // Bloco de risco climático nas praças com Cedente/Sacado.
    if (disaster.length > 0) {
      const items = disaster.map((d) => {
        const data = formatPublishedAtBR(d.publishedAt);
        const dateLine = data ? `🗓️ ${data}\n` : '';
        return `🌪️ ${d.title.trim()}\n${dateLine}${d.url}`;
      });
      sections.push(
        ['*🌪️ Risco climático — praças com Cedente/Sacado*', items.join('\n\n')].join('\n'),
      );
    }

    return sections.join('\n\n');
  }
}
