import type { ArticleRepository } from '../../../collection/domain/repositories/ArticleRepository.js';
import { ArticleAnalysis, type ArticleAnalysisAreas } from '../../domain/entities/ArticleAnalysis.js';
import type { ArticleAnalysisRepository } from '../../domain/repositories/ArticleAnalysisRepository.js';
import type { ClassificationRepository } from '../../domain/repositories/ClassificationRepository.js';
import { formatPublishedAtBR } from '../../domain/services/ExecutiveSummaryBuilder.js';
import type { AuditLogger } from '../../infrastructure/audit/AuditLogger.js';
import type { ArticleContentFetcher } from '../../infrastructure/content/ArticleContentFetcher.js';
import type { LlmClient } from '../../infrastructure/llm/LlmClient.js';
import {
  ANALYSIS_PROMPT_VERSION,
  ANALYSIS_SYSTEM_PROMPT,
  buildAnalysisUserPrompt,
} from '../../infrastructure/llm/prompts/analysisPrompt.js';

interface ParsedAnalysis {
  resumo_executivo?: unknown;
  areas?: Record<string, unknown>;
  acoes?: unknown;
}

export interface GenerateArticleAnalysisResult {
  /** Quantas análises foram geradas e persistidas. */
  analyzed: number;
  /** Quantas conseguiram ler o corpo do artigo (resto = título/paywall). */
  read: number;
}

const AREA_KEYS = ['comercial', 'cobranca', 'operacoes', 'risco', 'compliance'] as const;

/**
 * GenerateArticleAnalysisUseCase — para cada notícia relevante: lê o CORPO do
 * artigo (quando possível) e gera, via LLM, a análise aplicada à Audax —
 * resumo executivo, impacto por área e ações. É o conteúdo do portal.
 *
 * Tolerante a falha: uma notícia que falha (fetch/HTTP/parse) é auditada e
 * pulada, sem derrubar as demais.
 */
export class GenerateArticleAnalysisUseCase {
  constructor(
    private readonly articleRepository: ArticleRepository,
    private readonly classificationRepository: ClassificationRepository,
    private readonly contentFetcher: ArticleContentFetcher,
    private readonly analysisRepository: ArticleAnalysisRepository,
    private readonly llm: LlmClient,
    private readonly audit: AuditLogger,
  ) {}

  async execute(articleIds: string[]): Promise<GenerateArticleAnalysisResult> {
    if (articleIds.length === 0) return { analyzed: 0, read: 0 };

    const articles = await this.articleRepository.findByIds(articleIds);
    const classifications = await this.classificationRepository.findCurrentByArticleIds(articleIds);

    let analyzed = 0;
    let read = 0;

    for (const article of articles) {
      const fetched = await this.contentFetcher.fetch(article.url);
      if (fetched.success) read += 1;

      // Enriquece a imagem com a og:image real do artigo (mais precisa que o
      // thumbnail genérico do agregador). Só para as notícias do portal.
      if (fetched.image) {
        try {
          await this.articleRepository.updateImage(article.id!, fetched.image);
        } catch (err) {
          console.error('⚠️  Falha ao atualizar imagem:', (err as Error).message);
        }
      }

      const cls = classifications.get(article.id!);
      const userPrompt = buildAnalysisUserPrompt({
        title: article.title,
        source: article.source,
        category: cls?.category ?? article.rawCategory ?? null,
        impact: cls?.impact ?? null,
        publishedAt: formatPublishedAtBR(article.publishedAt),
        body: fetched.text,
      });

      try {
        const completion = await this.llm.complete({
          system: ANALYSIS_SYSTEM_PROMPT,
          user: userPrompt,
          jsonMode: true,
        });

        const parsed = this.safeParse(completion.text);
        if (!parsed) {
          await this.audit.record({
            prompt: userPrompt,
            rawResponse: completion.text,
            model: completion.model,
            latencyMs: completion.latencyMs,
            tokensInput: completion.tokensInput,
            tokensOutput: completion.tokensOutput,
            status: 'parse_error',
            errorMessage: 'Análise: resposta não é JSON no formato esperado.',
          });
          continue;
        }

        await this.analysisRepository.saveCurrent(
          new ArticleAnalysis({
            articleId: article.id!,
            sourceRead: fetched.success,
            sourceChars: fetched.chars,
            executiveSummary:
              typeof parsed.resumo_executivo === 'string' ? parsed.resumo_executivo : '',
            areas: this.normalizeAreas(parsed.areas),
            actions: Array.isArray(parsed.acoes)
              ? parsed.acoes.filter((a): a is string => typeof a === 'string')
              : [],
            model: completion.model,
            promptVersion: ANALYSIS_PROMPT_VERSION,
          }),
        );

        await this.audit.record({
          prompt: userPrompt,
          rawResponse: completion.text,
          model: completion.model,
          latencyMs: completion.latencyMs,
          tokensInput: completion.tokensInput,
          tokensOutput: completion.tokensOutput,
          status: 'success',
        });

        analyzed += 1;
        console.log(
          `🧾 Análise ${analyzed}/${articles.length} (${fetched.success ? 'corpo lido' : 'só título'}): ${article.title.slice(0, 60)}`,
        );
      } catch (err) {
        await this.audit.record({
          prompt: userPrompt,
          model: this.llm.model,
          status: 'error',
          errorMessage: `Análise falhou: ${(err as Error).message}`,
        });
      }
    }

    return { analyzed, read };
  }

  private normalizeAreas(areas: Record<string, unknown> | undefined): ArticleAnalysisAreas {
    const out: ArticleAnalysisAreas = {};
    if (!areas) return out;
    for (const key of AREA_KEYS) {
      const v = areas[key];
      if (typeof v === 'string' && v.trim()) out[key] = v.trim();
    }
    return out;
  }

  private safeParse(text: string): ParsedAnalysis | null {
    try {
      const cleaned = text.trim().replace(/^```(?:json)?/i, '').replace(/```$/, '').trim();
      const data = JSON.parse(cleaned);
      if (data && typeof data === 'object' && !Array.isArray(data)) return data as ParsedAnalysis;
      return null;
    } catch {
      return null;
    }
  }
}
