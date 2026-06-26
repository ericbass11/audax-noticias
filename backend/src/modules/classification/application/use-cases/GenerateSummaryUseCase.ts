import type { ArticleRepository } from '../../../collection/domain/repositories/ArticleRepository.js';
import type { ClassificationRepository } from '../../domain/repositories/ClassificationRepository.js';
import {
  ExecutiveSummaryBuilder,
  type ScoredArticle,
} from '../../domain/services/ExecutiveSummaryBuilder.js';

export interface GenerateSummaryResult {
  /** Texto final pronto para WhatsApp (PT-BR). */
  content: string;
  /** Artigos selecionados (top N), em ordem de relevância. */
  rankedArticleIds: string[];
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

  async execute(articleIds: string[]): Promise<GenerateSummaryResult | null> {
    const articles = await this.articleRepository.findByIds(articleIds);
    const classifications = await this.classificationRepository.findCurrentByArticleIds(articleIds);

    const scored: ScoredArticle[] = articles
      .map((article) => {
        const classification = classifications.get(article.id!);
        return classification ? { article, classification } : null;
      })
      .filter((s): s is ScoredArticle => s !== null);

    if (scored.length === 0) return null;

    const top = this.builder.selectTop(scored);
    // Nada acima do piso de relevância → sem resumo (não dispara nada).
    if (top.length === 0) return null;

    return {
      content: this.builder.buildMessage(top, this.webAppUrl),
      rankedArticleIds: top.map((s) => s.article.id!),
    };
  }
}
