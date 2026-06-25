import type { Article } from '../../../collection/domain/entities/Article.js';
import type { ArticleRepository } from '../../../collection/domain/repositories/ArticleRepository.js';
import type { AuditLogger } from '../../infrastructure/audit/AuditLogger.js';
import type { LlmClient } from '../../infrastructure/llm/LlmClient.js';
import {
  TRIAGE_SYSTEM_PROMPT,
  buildTriageUserPrompt,
  toTriageItems,
} from '../../infrastructure/llm/prompts/triagePrompt.js';

interface TriageResultItem {
  id?: string;
  score?: unknown;
}

export interface TriageArticlesResult {
  /** Ids que sobreviveram (score >= corte), já limitados ao teto e ordenados. */
  survivorIds: string[];
  /** Total avaliado pela triagem. */
  evaluated: number;
}

/**
 * TriageArticlesUseCase — filtro BARATO (modelo leve) que roda ANTES da
 * classificação cara. Pontua cada notícia (0-100) só pelo título e mantém
 * apenas as acima do corte, limitadas a um teto (as de maior score). Assim o
 * modelo caro só vê o que vale a pena, em vez de classificar centenas para
 * aproveitar poucas.
 *
 * Tolerante a falha: um lote que falha (HTTP/parse) é auditado e, por
 * segurança, seus artigos são MANTIDOS (não descartamos por erro de infra).
 */
export class TriageArticlesUseCase {
  constructor(
    private readonly articleRepository: ArticleRepository,
    private readonly llm: LlmClient,
    private readonly audit: AuditLogger,
    private readonly batchSize: number,
    private readonly minScore: number,
    private readonly maxToClassify: number,
  ) {}

  async execute(articleIds: string[]): Promise<TriageArticlesResult> {
    const articles = await this.articleRepository.findByIds(articleIds);
    if (articles.length === 0) return { survivorIds: [], evaluated: 0 };

    const batches = this.chunk(articles, this.batchSize);
    const scored: { id: string; score: number }[] = [];

    for (const batch of batches) {
      scored.push(...(await this.triageBatch(batch)));
    }

    // Corte por score + teto (maiores scores primeiro) para limitar o custo
    // da classificação profunda a um número previsível.
    const survivorIds = scored
      .filter((s) => s.score >= this.minScore)
      .sort((a, b) => b.score - a.score)
      .slice(0, this.maxToClassify)
      .map((s) => s.id);

    console.log(
      `🔎 Triagem: ${survivorIds.length}/${articles.length} acima do corte (>=${this.minScore}, teto ${this.maxToClassify}).`,
    );

    return { survivorIds, evaluated: articles.length };
  }

  private async triageBatch(batch: Article[]): Promise<{ id: string; score: number }[]> {
    const items = toTriageItems(batch);
    const userPrompt = buildTriageUserPrompt(items);
    const ids = new Set(batch.map((a) => a.id!));

    try {
      const completion = await this.llm.complete({
        system: TRIAGE_SYSTEM_PROMPT,
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
          errorMessage: 'Triagem: resposta não é JSON no formato esperado.',
        });
        // Falha de parse: mantém o lote inteiro (não perde notícia por erro).
        return batch.map((a) => ({ id: a.id!, score: 100 }));
      }

      await this.audit.record({
        prompt: userPrompt,
        rawResponse: completion.text,
        model: completion.model,
        latencyMs: completion.latencyMs,
        tokensInput: completion.tokensInput,
        tokensOutput: completion.tokensOutput,
        status: 'success',
      });

      return parsed
        .filter((r): r is TriageResultItem & { id: string } =>
          typeof r.id === 'string' && ids.has(r.id),
        )
        .map((r) => ({ id: r.id, score: this.clampScore(r.score) }));
    } catch (err) {
      await this.audit.record({
        prompt: userPrompt,
        model: this.llm.model,
        status: 'error',
        errorMessage: `Triagem falhou: ${(err as Error).message}`,
      });
      // Falha de infra: mantém o lote (segurança > economia).
      return batch.map((a) => ({ id: a.id!, score: 100 }));
    }
  }

  private clampScore(value: unknown): number {
    const n = typeof value === 'number' ? value : Number(value);
    if (!Number.isFinite(n)) return 0;
    return Math.max(0, Math.min(100, Math.round(n)));
  }

  private safeParse(text: string): TriageResultItem[] | null {
    try {
      const cleaned = text.trim().replace(/^```(?:json)?/i, '').replace(/```$/, '').trim();
      const data = JSON.parse(cleaned);
      if (Array.isArray(data)) return data as TriageResultItem[];
      if (data && Array.isArray(data.resultados)) return data.resultados as TriageResultItem[];
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
