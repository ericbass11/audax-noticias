import type { Article } from '../../../collection/domain/entities/Article.js';
import type { ArticleRepository } from '../../../collection/domain/repositories/ArticleRepository.js';
import { Classification } from '../../domain/entities/Classification.js';
import type { ClassificationRepository } from '../../domain/repositories/ClassificationRepository.js';
import { isImpact } from '../../domain/value-objects/Impact.js';
import { RelevanceScore } from '../../domain/value-objects/RelevanceScore.js';
import type { AuditLogger } from '../../infrastructure/audit/AuditLogger.js';
import type { LlmClient } from '../../infrastructure/llm/LlmClient.js';
import {
  CLASSIFICATION_PROMPT_VERSION,
  CLASSIFICATION_SYSTEM_PROMPT,
  buildClassificationUserPrompt,
  toPromptItems,
} from '../../infrastructure/llm/prompts/classificationPrompt.js';

interface LlmResultItem {
  id?: string;
  impacto?: unknown;
  relevancia?: unknown;
  categoria?: unknown;
  justificativa_curta?: unknown;
}

export interface ClassifyArticlesResult {
  classified: number;
  classificationIds: string[];
}

/**
 * ClassifyArticlesUseCase — classifica um conjunto de artigos (por id) em
 * lotes via LiteLLM, faz parse seguro do JSON, persiste as classificações
 * (versionadas) e registra auditoria por chamada.
 *
 * Tolerante a falha: um lote que falha (HTTP ou parse) é auditado e pulado,
 * sem derrubar os demais.
 */
export class ClassifyArticlesUseCase {
  constructor(
    private readonly articleRepository: ArticleRepository,
    private readonly classificationRepository: ClassificationRepository,
    private readonly llm: LlmClient,
    private readonly audit: AuditLogger,
    private readonly batchSize: number,
  ) {}

  async execute(articleIds: string[]): Promise<ClassifyArticlesResult> {
    const articles = await this.articleRepository.findByIds(articleIds);
    if (articles.length === 0) return { classified: 0, classificationIds: [] };

    const batches = this.chunk(articles, this.batchSize);
    const classificationIds: string[] = [];

    // Persiste LOTE A LOTE: cada lote classificado é gravado imediatamente.
    // Assim uma interrupção no meio do ciclo preserva o que já foi feito
    // (em vez do antigo "tudo ou nada" só no final).
    for (let i = 0; i < batches.length; i++) {
      const classified = await this.classifyBatch(batches[i]!);
      if (classified.length === 0) continue;
      const saved = await this.classificationRepository.saveBatch(classified);
      classificationIds.push(...saved.map((c) => c.id!));
      console.log(`💾 Lote ${i + 1}/${batches.length}: ${saved.length} classificações gravadas.`);
    }

    return { classified: classificationIds.length, classificationIds };
  }

  private async classifyBatch(batch: Article[]): Promise<Classification[]> {
    const items = toPromptItems(batch);
    const userPrompt = buildClassificationUserPrompt(items);
    const byId = new Map(batch.map((a) => [a.id!, a]));

    try {
      const completion = await this.llm.complete({
        system: CLASSIFICATION_SYSTEM_PROMPT,
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
          errorMessage: 'Resposta do LLM não é JSON no formato esperado.',
        });
        return [];
      }

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

      return parsed
        .filter(
          (r): r is LlmResultItem & { id: string } =>
            typeof r.id === 'string' && byId.has(r.id),
        )
        .map((r) => {
          const impact = isImpact(r.impacto) ? r.impacto : 'neutro';
          return new Classification({
            articleId: r.id,
            impact,
            relevance: RelevanceScore.create(r.relevancia).value,
            category: typeof r.categoria === 'string' ? r.categoria : 'Outros',
            justification:
              typeof r.justificativa_curta === 'string' ? r.justificativa_curta : '',
            model: completion.model,
            promptVersion: CLASSIFICATION_PROMPT_VERSION,
          });
        });
    } catch (err) {
      await this.audit.record({
        prompt: userPrompt,
        model: this.llm.model,
        status: 'error',
        errorMessage: (err as Error).message,
      });
      return [];
    }
  }

  /** Parse seguro: aceita {resultados:[...]} ou um array direto; nunca lança. */
  private safeParse(text: string): LlmResultItem[] | null {
    try {
      const cleaned = text.trim().replace(/^```(?:json)?/i, '').replace(/```$/, '').trim();
      const data = JSON.parse(cleaned);
      if (Array.isArray(data)) return data as LlmResultItem[];
      if (data && Array.isArray(data.resultados)) return data.resultados as LlmResultItem[];
      return null;
    } catch {
      return null;
    }
  }

  private chunk<T>(arr: T[], size: number): T[][] {
    const out: T[][] = [];
    for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
    return out;
  }
}
