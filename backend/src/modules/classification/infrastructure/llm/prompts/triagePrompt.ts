import type { Article } from '../../../../collection/domain/entities/Article.js';

/**
 * Versão do prompt de triagem (auditoria / reprocesso).
 */
export const TRIAGE_PROMPT_VERSION = 'triage-v1';

/** Item enxuto que a triagem recebe — só o necessário para pontuar pelo título. */
export interface TriagePromptItem {
  id: string;
  title: string;
  source: string;
  rawCategory: string | null;
}

export function toTriageItems(articles: Article[]): TriagePromptItem[] {
  return articles.map((a) => ({
    id: a.id!,
    title: a.title,
    source: a.source,
    rawCategory: a.rawCategory,
  }));
}

/**
 * Prompt de TRIAGEM (modelo leve/barato). Não classifica — apenas estima, pelo
 * título, o quão promissora a notícia é para uma FIDC de recebíveis agro. O
 * objetivo é descartar o lixo barato ANTES da classificação cara. Erre para o
 * lado de manter: a classificação profunda decide o veredito final.
 */
export const TRIAGE_SYSTEM_PROMPT = `Você é um filtro rápido de triagem de notícias para uma FIDC (Fundo de Investimento em Direitos Creditórios) de recebíveis com forte exposição ao agronegócio brasileiro (Audax Capital).

O que IMPORTA para esta FIDC: macroeconomia (Selic, câmbio, inflação, política monetária), agronegócio (safra, commodities, clima, crédito rural, Plano Safra), regulação (BACEN, CVM, CMN), inadimplência/crédito e o setor de FIDCs/securitização.

O que NÃO importa (descarte com score baixo): esportes, entretenimento, celebridades, fofoca, horóscopo, games, novelas, política partidária sem efeito econômico, esportes, polícia/crimes locais sem relação financeira.

Tarefa: para CADA notícia, dê um "score" inteiro de 0 a 100 estimando, SÓ pelo título, a probabilidade de ser relevante para a FIDC. Não classifique impacto nem categoria — isso é outra etapa. Na dúvida entre relevante e irrelevante, pontue mais alto (a etapa seguinte filtra melhor).

REGRAS DE SAÍDA (obrigatório):
- Responda SOMENTE com JSON válido, sem markdown, sem cercas de código, sem preâmbulo.
- Forma: {"resultados": [{"id": "<id>", "score": 0}]}
- Exatamente um objeto por notícia recebida, repetindo o "id" fornecido.`;

export function buildTriageUserPrompt(items: TriagePromptItem[]): string {
  return `Pontue (0-100) a relevância potencial de cada notícia. Retorne um objeto por id no array "resultados".

NOTÍCIAS:
${JSON.stringify(items, null, 2)}`;
}
