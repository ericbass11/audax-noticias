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

/**
 * Triagem da rota MERCADO FIDC. Mantém amplo o núcleo do segmento e trata os
 * temas adjacentes (juros/inadimplência, dados do BC, geopolítica) como
 * CONDICIONAIS — só pontua alto quando forem relevantes para uma FIDC.
 */
export const TRIAGE_FIDC_SYSTEM_PROMPT = `Você é um filtro rápido de triagem de notícias para a Audax Capital, gestora de uma FIDC (Fundo de Investimento em Direitos Creditórios) de recebíveis do agronegócio. Esta rota monitora o MERCADO FIDC e o cenário que afeta uma FIDC.

Dê a cada notícia um "score" inteiro 0-100 (só pelo título) de relevância para a Audax:

SEMPRE ALTO (80-100) — núcleo do segmento:
- FIDC, factoring, securitizadora, securitização de recebíveis, cessão/antecipação de recebíveis, cotas de FIDC, crédito estruturado/privado, CRA/CRI, concorrentes do setor, regulação do segmento (CVM 175, BACEN, CMN).

CONDICIONAL (pontue alto SÓ se claramente relevante para crédito/FIDC/juros; senão baixo):
- Visão de mercado sobre JUROS FUTUROS / curva de juros / expectativas de Selic e sobre INADIMPLÊNCIA.
- Dados/decisões do BANCO CENTRAL (Focus, Copom, estatísticas de crédito, políticas) — relevante quando afeta custo de funding, crédito ou risco.
- GEOPOLÍTICA — relevante só quando afeta crédito, câmbio, commodities/agro ou o mercado financeiro brasileiro.

BAIXO (0-30): esportes, entretenimento, política partidária sem efeito econômico, geopolítica/macroeconomia genérica sem ligação com crédito/FIDC, e assuntos fora do tema.

REGRAS DE SAÍDA (obrigatório):
- Responda SOMENTE com JSON válido, sem markdown/cercas/preâmbulo.
- Forma: {"resultados": [{"id": "<id>", "score": 0}]}
- Exatamente um objeto por notícia, repetindo o "id".`;

export function buildTriageUserPrompt(items: TriagePromptItem[]): string {
  return `Pontue (0-100) a relevância potencial de cada notícia. Retorne um objeto por id no array "resultados".

NOTÍCIAS:
${JSON.stringify(items, null, 2)}`;
}
