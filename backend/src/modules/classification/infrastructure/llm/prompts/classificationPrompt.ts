import type { Article } from '../../../../collection/domain/entities/Article.js';

/**
 * Versão do prompt. Persistida em cada classificação (`prompt_version`) para
 * a trilha de auditoria e para permitir reprocessar comparando versões.
 */
export const CLASSIFICATION_PROMPT_VERSION = 'classify-v1';

/** Item que o LLM recebe e deve referenciar pelo `id` no array de resposta. */
export interface PromptArticleItem {
  id: string;
  title: string;
  summary: string | null;
  source: string;
  rawCategory: string | null;
}

export function toPromptItems(articles: Article[]): PromptArticleItem[] {
  return articles.map((a) => ({
    id: a.id!,
    title: a.title,
    summary: a.summary,
    source: a.source,
    rawCategory: a.rawCategory,
  }));
}

export const CLASSIFICATION_SYSTEM_PROMPT = `Você é um analista de risco de crédito de uma FIDC (Fundo de Investimento em Direitos Creditórios) de recebíveis com forte exposição ao agronegócio brasileiro, chamada Audax Capital.

Contexto da operação:
- Regulada por BACEN, CMN e CVM (Resolução CVM 175) e sujeita à LGPD.
- Exposição principal: crédito do agronegócio (recebíveis agro).
- Fatores que importam: macroeconomia (Selic, câmbio, inflação), agronegócio (safra, commodities, clima, crédito rural), regulação (BACEN, CVM, CMN), inadimplência/crédito e o próprio setor de FIDCs.

Sua tarefa: para CADA notícia recebida, avaliar o impacto para ESTA FIDC de recebíveis agro especificamente.

Para cada notícia retorne:
- "impacto": um de "positivo" | "negativo" | "neutro" (do ponto de vista do risco/retorno da FIDC).
- "relevancia": inteiro de 0 a 100 (quão relevante para as operações da FIDC; 0 = irrelevante, 100 = crítica).
- "categoria": uma string curta entre: "Macroeconomia", "Agronegócio", "Regulação", "Crédito/Inadimplência", "Setor FIDC" ou "Outros".
- "justificativa_curta": 1 a 2 frases em português explicando POR QUE afeta uma FIDC de recebíveis agro especificamente.

REGRAS DE SAÍDA (obrigatório):
- Responda SOMENTE com JSON válido, sem markdown, sem cercas de código, sem preâmbulo.
- O JSON deve ter a forma: {"resultados": [{"id": "<id da notícia>", "impacto": "...", "relevancia": 0, "categoria": "...", "justificativa_curta": "..."}]}
- Inclua exatamente um objeto por notícia recebida, repetindo o "id" fornecido.`;

export function buildClassificationUserPrompt(items: PromptArticleItem[]): string {
  return `Classifique as seguintes notícias. Retorne um objeto por id, no array "resultados".

NOTÍCIAS:
${JSON.stringify(items, null, 2)}`;
}
