/**
 * RelevanceScore — inteiro 0..100. Faz o clamp defensivo: se o LLM devolver
 * algo fora do range ou não-numérico, normalizamos em vez de quebrar.
 */
export class RelevanceScore {
  private constructor(public readonly value: number) {}

  static create(raw: unknown): RelevanceScore {
    const n = Math.round(Number(raw));
    if (Number.isNaN(n)) return new RelevanceScore(0);
    return new RelevanceScore(Math.min(100, Math.max(0, n)));
  }
}
