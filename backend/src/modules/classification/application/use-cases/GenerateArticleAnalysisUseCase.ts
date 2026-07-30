import type { ArticleRepository } from '../../../collection/domain/repositories/ArticleRepository.js';
import { ArticleAnalysis, type ArticleAnalysisAreas } from '../../domain/entities/ArticleAnalysis.js';
import type { ArticleAnalysisRepository } from '../../domain/repositories/ArticleAnalysisRepository.js';
import type { ClassificationRepository } from '../../domain/repositories/ClassificationRepository.js';
import { formatPublishedAtBR } from '../../domain/services/ExecutiveSummaryBuilder.js';
import type { AuditLogger } from '../../infrastructure/audit/AuditLogger.js';
import type { ArticleContentFetcher } from '../../infrastructure/content/ArticleContentFetcher.js';
import type { LlmClient } from '../../infrastructure/llm/LlmClient.js';
import { parseLlmJson } from '../../infrastructure/llm/parseLlmJson.js';
import {
  ANALYSIS_PROMPT_VERSION,
  ANALYSIS_SYSTEM_PROMPT,
  ANALYSIS_WATCHLIST_SYSTEM_PROMPT,
  ANALYSIS_FIDC_SYSTEM_PROMPT,
  ANALYSIS_DISASTER_SYSTEM_PROMPT,
  buildAnalysisUserPrompt,
} from '../../infrastructure/llm/prompts/analysisPrompt.js';

export type AnalysisMode = 'news' | 'watchlist' | 'fidc' | 'disaster';

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
 * Teto de caracteres do CORPO enviado à análise (economia de tokens de input).
 * O miolo da notícia (lide + fatos) está no começo; a cauda (relacionados,
 * rodapé, comentários) quase não muda a análise e infla o custo do Sonnet.
 * O texto COMPLETO continua salvo em `sourceText` (para o chat do portal).
 */
const MAX_ANALYSIS_BODY_CHARS = 8000;

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

  async execute(
    articleIds: string[],
    opts: { mode?: AnalysisMode } = {},
  ): Promise<GenerateArticleAnalysisResult> {
    if (articleIds.length === 0) return { analyzed: 0, read: 0 };

    const systemPrompt =
      opts.mode === 'watchlist'
        ? ANALYSIS_WATCHLIST_SYSTEM_PROMPT
        : opts.mode === 'fidc'
          ? ANALYSIS_FIDC_SYSTEM_PROMPT
          : opts.mode === 'disaster'
            ? ANALYSIS_DISASTER_SYSTEM_PROMPT
            : ANALYSIS_SYSTEM_PROMPT;
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
        // Corta o corpo para a análise (economia); texto completo fica em sourceText.
        body: fetched.text?.slice(0, MAX_ANALYSIS_BODY_CHARS) ?? fetched.text,
      });

      try {
        const completion = await this.llm.complete({
          system: systemPrompt,
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
            tokensCacheRead: completion.tokensCacheRead,
            tokensCacheWrite: completion.tokensCacheWrite,
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
            sourceText: fetched.text,
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
          tokensCacheRead: completion.tokensCacheRead,
          tokensCacheWrite: completion.tokensCacheWrite,
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
    const data = parseLlmJson(text);
    if (data && typeof data === 'object' && !Array.isArray(data)) return data as ParsedAnalysis;
    return null;
  }
}
