/**
 * Impacto da notícia para uma FIDC de recebíveis agro.
 * Vocabulário fechado em PT-BR (alinhado ao que o LLM deve retornar).
 */
export type Impact = 'positivo' | 'negativo' | 'neutro';

export const IMPACTS: readonly Impact[] = ['positivo', 'negativo', 'neutro'] as const;

export function isImpact(value: unknown): value is Impact {
  return typeof value === 'string' && (IMPACTS as readonly string[]).includes(value);
}
