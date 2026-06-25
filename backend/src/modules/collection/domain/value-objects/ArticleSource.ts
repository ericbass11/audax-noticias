/**
 * Tipo de fonte de onde a notícia foi coletada. Mantido pequeno e explícito;
 * novas fontes (ex.: NewsData.io) entram aqui sem afetar o domínio.
 */
export type SourceType = 'gnews' | 'rss';

export const SOURCE_TYPES: readonly SourceType[] = ['gnews', 'rss'] as const;
