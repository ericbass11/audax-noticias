import type { ArticleRepository } from '../../../collection/domain/repositories/ArticleRepository.js';
import type { ClassificationRepository } from '../../domain/repositories/ClassificationRepository.js';
import {
  ExecutiveSummaryBuilder,
  type ScoredArticle,
  type WatchlistMessageItem,
} from '../../domain/services/ExecutiveSummaryBuilder.js';

export interface GenerateSummaryResult {
  /** Texto final pronto para WhatsApp (PT-BR). */
  content: string;
  /** Artigos do WhatsApp (top N, capados), em ordem de relevância. */
  rankedArticleIds: string[];
  /** TODAS as relevantes (acima do piso, sem teto) — conjunto do portal. */
  relevantArticleIds: string[];
}

/**
 * GenerateSummaryUseCase — produz UM resumo executivo consolidado do lote.
 *
 * Seleciona as notícias de maior relevância (acima do piso) e monta a mensagem
 * de forma DETERMINÍSTICA a partir dos dados já classificados: título ORIGINAL
 * da fonte, categoria, impacto, data de publicação e URL. Não usamos o LLM aqui
 * para não reescrever/alterar os títulos reais (a IA só atua na classificação).
 */
export class GenerateSummaryUseCase {
  private readonly builder: ExecutiveSummaryBuilder;

  constructor(
    private readonly articleRepository: ArticleRepository,
    private readonly classificationRepository: ClassificationRepository,
    /** URL base do portal (para o link de cada notícia no WhatsApp). */
    private readonly webAppUrl: string,
    /** Piso de relevância p/ o resumo (gate do CEO). */
    minRelevance = 0,
    /** Teto de itens no resumo. */
    maxItems = 5,
  ) {
    this.builder = new ExecutiveSummaryBuilder(minRelevance, maxItems);
  }

  async execute(
    articleIds: string[],
    watchlistIds: string[] = [],
    disasterIds: string[] = [],
  ): Promise<GenerateSummaryResult | null> {
    const articles = await this.articleRepository.findByIds(articleIds);
    const classifications = await this.classificationRepository.findCurrentByArticleIds(articleIds);

    const scored: ScoredArticle[] = articles
      .map((article) => {
        const classification = classifications.get(article.id!);
        return classification ? { article, classification } : null;
      })
      .filter((s): s is ScoredArticle => s !== null);

    const relevant = scored.length ? this.builder.selectRelevant(scored) : [];
    const top = scored.length ? this.builder.selectTop(scored) : [];

    // Itens da rota de vigilância (ANVISA) para o bloco de alertas.
    const watchlistArticles = await this.articleRepository.findByIds(watchlistIds);
    const watchlist: WatchlistMessageItem[] = watchlistArticles.map((a) => ({
      id: a.id!,
      title: a.title,
      url: a.url,
      publishedAt: a.publishedAt,
    }));

    // Itens de desastre climático (praças com Cedente/Sacado) para o bloco de risco.
    const disasterArticles = await this.articleRepository.findByIds(disasterIds);
    const disaster: WatchlistMessageItem[] = disasterArticles.map((a) => ({
      id: a.id!,
      title: a.title,
      url: a.url,
      publishedAt: a.publishedAt,
    }));

    // Sem nada relevante E sem alertas (ANVISA/desastre) → não dispara nada.
    if (relevant.length === 0 && watchlist.length === 0 && disaster.length === 0) return null;

    return {
      content: this.builder.buildMessage(top, this.webAppUrl, watchlist, disaster),
      rankedArticleIds: top.map((s) => s.article.id!),
      relevantArticleIds: relevant.map((s) => s.article.id!),
    };
  }
}
