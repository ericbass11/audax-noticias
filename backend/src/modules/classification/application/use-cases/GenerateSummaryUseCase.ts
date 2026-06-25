import type { ArticleRepository } from '../../../collection/domain/repositories/ArticleRepository.js';
import type { ClassificationRepository } from '../../domain/repositories/ClassificationRepository.js';
import {
  ExecutiveSummaryBuilder,
  type ScoredArticle,
} from '../../domain/services/ExecutiveSummaryBuilder.js';
import type { AuditLogger } from '../../infrastructure/audit/AuditLogger.js';
import type { LlmClient } from '../../infrastructure/llm/LlmClient.js';
import {
  SUMMARY_SYSTEM_PROMPT,
  buildSummaryUserPrompt,
} from '../../infrastructure/llm/prompts/summaryPrompt.js';

export interface GenerateSummaryResult {
  /** Texto final pronto para WhatsApp (PT-BR). */
  content: string;
  /** Artigos selecionados (top 3-5), em ordem de relevância. */
  rankedArticleIds: string[];
  /** true se o texto veio do fallback determinístico (LLM indisponível). */
  usedFallback: boolean;
}

/**
 * GenerateSummaryUseCase — produz UM resumo executivo consolidado do lote.
 *
 * Seleciona as 3-5 notícias de maior relevância e pede ao LLM um texto curto
 * para WhatsApp. Se o LLM falhar, cai num texto determinístico (builder),
 * garantindo que o disparo nunca fique sem conteúdo.
 */
export class GenerateSummaryUseCase {
  private readonly builder = new ExecutiveSummaryBuilder();

  constructor(
    private readonly articleRepository: ArticleRepository,
    private readonly classificationRepository: ClassificationRepository,
    private readonly llm: LlmClient,
    private readonly audit: AuditLogger,
    private readonly webAppUrl: string,
  ) {}

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
    const rankedArticleIds = top.map((s) => s.article.id!);

    // Tenta gerar via LLM; em qualquer falha usa o fallback determinístico.
    const userPrompt = buildSummaryUserPrompt(top, this.webAppUrl);
    try {
      const completion = await this.llm.complete({
        system: SUMMARY_SYSTEM_PROMPT,
        user: userPrompt,
        temperature: 0.4,
      });
      const content = completion.text.trim();
      if (!content) throw new Error('Resumo vazio do LLM.');

      await this.audit.record({
        prompt: userPrompt,
        rawResponse: content,
        model: completion.model,
        latencyMs: completion.latencyMs,
        tokensInput: completion.tokensInput,
        tokensOutput: completion.tokensOutput,
        status: 'success',
      });

      return { content, rankedArticleIds, usedFallback: false };
    } catch (err) {
      await this.audit.record({
        prompt: userPrompt,
        model: this.llm.model,
        status: 'error',
        errorMessage: `Resumo via LLM falhou, usando fallback: ${(err as Error).message}`,
      });
      const content = this.builder.buildFallbackText(top, this.webAppUrl);
      return { content, rankedArticleIds, usedFallback: true };
    }
  }
}
