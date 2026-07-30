import type { ArticleTrack } from '../../../collection/domain/entities/Article.js';
import type { ArticleRepository } from '../../../collection/domain/repositories/ArticleRepository.js';
import type { AuditLogger } from '../../infrastructure/audit/AuditLogger.js';
import type { LlmClient } from '../../infrastructure/llm/LlmClient.js';
import { parseLlmJson } from '../../infrastructure/llm/parseLlmJson.js';

const SYSTEM = `Você compara notícias NOVAS (candidatas a envio agora) com notícias JÁ ENVIADAS nos últimos dias, para não repetir a mesma história em dias diferentes.

Receberá dois arrays:
- "enviadas": notícias já enviadas antes (id + titulo).
- "novas": notícias candidatas de agora (id + titulo).

Identifique quais NOVAS tratam do MESMO fato/acontecimento de alguma já ENVIADA (mesmo dado, evento, decisão, número, empresa ou fato gerador), ainda que por outro veículo ou com título reescrito. Essas são repetições.

Regra de ouro: só marque como repetição se for CLARAMENTE o mesmo fato já enviado. Um desdobramento novo, um novo dado ou um novo ângulo NÃO é repetição. Na dúvida, NÃO remova.

Responda SOMENTE com JSON válido, sem markdown:
{"remover": ["<id_da_nova_que_repete>", ...]}`;

interface Parsed {
  remover?: unknown;
}

export interface DedupeHistoryOptions {
  track: ArticleTrack;
  /** Janela do histórico, em dias. */
  sinceDays: number;
  /** Rótulo para o log (default = track). */
  label?: string;
}

/** Teto de notícias históricas enviadas ao LLM (limita custo/prompt). */
const HISTORY_LIMIT = 120;

/**
 * DedupeAgainstHistoryUseCase — evita reenviar a MESMA história em dias
 * diferentes. O dedup exato (content_hash) já impede a mesma URL/título repetir;
 * este pega a mesma história vinda de OUTRO veículo/dia (hash diferente).
 *
 * Compara as candidatas do ciclo com as notícias da mesma trilha que já foram
 * analisadas (surfadas no portal/digest) na janela recente. O LLM leve devolve
 * quais candidatas REPETEM algo já enviado — essas são cortadas.
 *
 * Tolerante a falha: qualquer erro/!parse → não remove nada (nunca perde
 * notícia por erro do modelo).
 */
export class DedupeAgainstHistoryUseCase {
  constructor(
    private readonly articleRepository: ArticleRepository,
    private readonly llm: LlmClient,
    private readonly audit: AuditLogger,
  ) {}

  async execute(candidateIds: string[], opts: DedupeHistoryOptions): Promise<string[]> {
    if (candidateIds.length === 0) return candidateIds;
    const label = opts.label ?? opts.track;
    let userPrompt = '';

    try {
      const history = await this.articleRepository.findRecentSurfaced({
        track: opts.track,
        sinceDays: opts.sinceDays,
        excludeIds: candidateIds,
        limit: HISTORY_LIMIT,
      });
      if (history.length === 0) return candidateIds; // nada enviado antes p/ comparar

      const candidates = await this.articleRepository.findByIds(candidateIds);
      userPrompt = `enviadas (últimos ${opts.sinceDays} dias):\n${JSON.stringify(
        history.map((h) => ({ id: h.id, titulo: h.title })),
        null,
        2,
      )}\n\nnovas:\n${JSON.stringify(
        candidates.map((c) => ({ id: c.id!, titulo: c.title })),
        null,
        2,
      )}`;

      const completion = await this.llm.complete({ system: SYSTEM, user: userPrompt, jsonMode: true });
      const parsed = this.safeParse(completion.text);
      const candidateSet = new Set(candidateIds);
      const remove =
        parsed && Array.isArray(parsed.remover)
          ? parsed.remover.filter((id): id is string => typeof id === 'string' && candidateSet.has(id))
          : [];

      await this.audit.record({
        prompt: userPrompt,
        rawResponse: completion.text,
        model: completion.model,
        latencyMs: completion.latencyMs,
        tokensInput: completion.tokensInput,
        tokensOutput: completion.tokensOutput,
        status: parsed ? 'success' : 'parse_error',
      });

      if (remove.length === 0) return candidateIds;
      const removeSet = new Set(remove);
      const keep = candidateIds.filter((id) => !removeSet.has(id));
      console.log(
        `🕰️  Dedup histórico (${label}): ${remove.length} repetida(s) de dias anteriores removida(s); ${keep.length}/${candidateIds.length} seguem.`,
      );
      return keep;
    } catch (err) {
      await this.audit.record({
        prompt: userPrompt,
        model: this.llm.model,
        status: 'error',
        errorMessage: `Dedup histórico (${label}) falhou: ${(err as Error).message}`,
      });
      return candidateIds; // erro → não remove nada
    }
  }

  private safeParse(text: string): Parsed | null {
    const data = parseLlmJson(text);
    return data && typeof data === 'object' ? (data as Parsed) : null;
  }
}
