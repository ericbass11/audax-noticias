import type { ArticleRepository } from '../../../collection/domain/repositories/ArticleRepository.js';
import type { AuditLogger } from '../../infrastructure/audit/AuditLogger.js';
import type { LlmClient } from '../../infrastructure/llm/LlmClient.js';

const SYSTEM = `Você agrupa notícias que tratam do MESMO fato regulatório (mesma ação da ANVISA sobre o mesmo produto/marca/lote/empresa), ainda que publicadas por veículos diferentes e com títulos distintos.

Receberá uma lista de notícias com "id" e "titulo". Agrupe as que se referem ao MESMO evento e escolha UM "id" representante por grupo (o título mais informativo). Notícias de eventos diferentes ficam cada uma em seu grupo.

Responda SOMENTE com JSON válido, sem markdown:
{"manter": ["<id_representante_1>", "<id_representante_2>"]}`;

interface Parsed {
  manter?: unknown;
}

/**
 * DedupeWatchlistUseCase — usa um modelo leve (Haiku) para colapsar notícias da
 * watchlist que tratam do mesmo fato regulatório (mesma ação ANVISA em vários
 * veículos). O dedup por tokens não pega títulos muito diferentes; aqui o LLM
 * agrupa por evento. Retorna os ids a MANTER (um por grupo).
 *
 * Tolerante a falha: se o LLM falhar/!parsear, devolve todos os ids (sem dedup).
 */
export class DedupeWatchlistUseCase {
  constructor(
    private readonly articleRepository: ArticleRepository,
    private readonly llm: LlmClient,
    private readonly audit: AuditLogger,
  ) {}

  async execute(articleIds: string[]): Promise<string[]> {
    if (articleIds.length <= 1) return articleIds;

    const articles = await this.articleRepository.findByIds(articleIds);
    const items = articles.map((a) => ({ id: a.id!, titulo: a.title }));
    const userPrompt = `Notícias:\n${JSON.stringify(items, null, 2)}`;
    const valid = new Set(articleIds);

    try {
      const completion = await this.llm.complete({ system: SYSTEM, user: userPrompt, jsonMode: true });
      const parsed = this.safeParse(completion.text);
      const keep =
        parsed && Array.isArray(parsed.manter)
          ? parsed.manter.filter((id): id is string => typeof id === 'string' && valid.has(id))
          : [];

      await this.audit.record({
        prompt: userPrompt,
        rawResponse: completion.text,
        model: completion.model,
        latencyMs: completion.latencyMs,
        tokensInput: completion.tokensInput,
        tokensOutput: completion.tokensOutput,
        status: keep.length > 0 ? 'success' : 'parse_error',
      });

      // Sem resultado válido → não arrisca perder notícias: mantém todas.
      if (keep.length === 0) return articleIds;
      console.log(`🧹 Dedup watchlist: ${keep.length}/${articleIds.length} após agrupar por evento.`);
      return keep;
    } catch (err) {
      await this.audit.record({
        prompt: userPrompt,
        model: this.llm.model,
        status: 'error',
        errorMessage: `Dedup watchlist falhou: ${(err as Error).message}`,
      });
      return articleIds;
    }
  }

  private safeParse(text: string): Parsed | null {
    try {
      const cleaned = text.trim().replace(/^```(?:json)?/i, '').replace(/```$/, '').trim();
      const data = JSON.parse(cleaned);
      return data && typeof data === 'object' ? (data as Parsed) : null;
    } catch {
      return null;
    }
  }
}
