import type { Article } from '../../../../collection/domain/entities/Article.js';

/**
 * Versão do prompt de triagem (auditoria / reprocesso).
 */
export const TRIAGE_PROMPT_VERSION = 'triage-v2';

/** Item enxuto que a triagem recebe — título + resumo + data informada. */
export interface TriagePromptItem {
  id: string;
  title: string;
  source: string;
  rawCategory: string | null;
  /** Resumo/snippet da fonte — dá contexto p/ relevância e atualidade. */
  summary: string | null;
  /** Data informada pela fonte (YYYY-MM-DD) — pode estar errada; a IA cruza com o conteúdo. */
  publishedAt: string | null;
}

export function toTriageItems(articles: Article[]): TriagePromptItem[] {
  return articles.map((a) => ({
    id: a.id!,
    title: a.title,
    source: a.source,
    rawCategory: a.rawCategory,
    summary: a.summary ?? null,
    publishedAt: a.publishedAt ? a.publishedAt.toISOString().slice(0, 10) : null,
  }));
}

/**
 * Regra de ATUALIDADE compartilhada pelas triagens. Além da relevância, a IA
 * avalia se a notícia é recente — pega casos como uma matéria de 2023 que o
 * feed reporta com data atual (ex.: páginas de "mais lidas"/agregadoras).
 */
const FRESHNESS_RULE = `ATUALIDADE (obrigatório, afeta o score): considere também se a notícia é ATUAL, cruzando o título + resumo com "publishedAt" (data informada, pode estar errada) e a data de HOJE. Dê score 0 (descartar) quando:
- o título/resumo indicar conteúdo ANTIGO/retrospectivo (ex.: trata um ano JÁ PASSADO como futuro — "2023 pode ser o ano..."; balanço de ano encerrado; "há X anos");
- for página de "mais lidas"/trending/agenda reaproveitada, ou o conteúdo for claramente incompatível com a data informada.
ATENÇÃO: apenas CITAR um ano/data passada (ex.: "crédito cresceu vs 2023") NÃO torna a notícia antiga — só rebaixe se a PRÓPRIA notícia for velha.`;

/**
 * Prompt de TRIAGEM (modelo leve/barato). Não classifica — apenas estima, pelo
 * título, o quão promissora a notícia é para uma FIDC de recebíveis agro. O
 * objetivo é descartar o lixo barato ANTES da classificação cara. Erre para o
 * lado de manter: a classificação profunda decide o veredito final.
 */
export const TRIAGE_SYSTEM_PROMPT = `Você é um filtro rápido de triagem de notícias para uma FIDC (Fundo de Investimento em Direitos Creditórios) de recebíveis com forte exposição ao agronegócio brasileiro (Audax Capital).

O que IMPORTA para esta FIDC: macroeconomia (Selic, câmbio, inflação, política monetária), agronegócio (safra, commodities, clima, crédito rural, Plano Safra), regulação (BACEN, CVM, CMN), inadimplência/crédito e o setor de FIDCs/securitização.

O que NÃO importa (descarte com score baixo): esportes, entretenimento, celebridades, fofoca, horóscopo, games, novelas, política partidária sem efeito econômico, esportes, polícia/crimes locais sem relação financeira.

Tarefa: para CADA notícia, dê um "score" inteiro de 0 a 100 estimando, pelo título e resumo, a probabilidade de ser relevante para a FIDC. Não classifique impacto nem categoria — isso é outra etapa. Na dúvida entre relevante e irrelevante, pontue mais alto (a etapa seguinte filtra melhor).

${FRESHNESS_RULE}

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

${FRESHNESS_RULE}

REGRAS DE SAÍDA (obrigatório):
- Responda SOMENTE com JSON válido, sem markdown/cercas/preâmbulo.
- Forma: {"resultados": [{"id": "<id>", "score": 0}]}
- Exatamente um objeto por notícia, repetindo o "id".`;

/**
 * Triagem da rota DESASTRES CLIMÁTICOS. As notícias já foram buscadas por
 * cidade (praças com Cedente/Sacado da Audax). Aqui a IA confirma que é um
 * desastre REAL, RECENTE e LOCALIZADO — não uma menção genérica, previsão vaga
 * ou matéria antiga.
 */
export const TRIAGE_DISASTER_SYSTEM_PROMPT = `Você é um filtro de triagem de notícias de DESASTRES CLIMÁTICOS para a Audax Capital, gestora de FIDC. Estas notícias foram buscadas por CIDADE onde a Audax tem Cedente/Sacado — um desastre nessas praças é risco de crédito (o sacado pode não pagar; o recebível do cedente vira risco).

REGRAS PRINCIPAIS: (1) só interessa desastre que JÁ OCORREU (não previsão/alerta futuro); (2) só desastre NATURAL/climático ou incêndio de GRANDE ESCALA, com impacto REGIONAL/econômico — NÃO incidente urbano isolado.

Dê a cada notícia um "score" inteiro 0-100 (pelo título + resumo):

ALTO (80-100): desastre NATURAL que JÁ ACONTECEU numa localidade concreta, com dano/impacto regional já registrado — enchente/alagamento/inundação, temporal/vendaval/tempestade com estragos, seca/estiagem com perda, granizo/geada que danificou lavoura, deslizamento, INCÊNDIO DE GRANDE ESCALA (florestal, queimada extensa, grande incêndio atingindo área/produção/indústria). Decreto de emergência/calamidade por evento já ocorrido também é alto.

BAIXO (0-30):
- PREVISÃO/ALERTA de risco futuro ("alerta amarelo/laranja/vermelho", "risco de temporal", "chuva prevista", "pode ocorrer", "previsão do tempo"). Na dúvida "vai ocorrer" x "ocorreu" → BAIXO.
- INCIDENTE ISOLADO de pequena escala, mesmo sendo fogo: incêndio de um apartamento/casa/loja/veículo/caminhão/trem, foco pequeno, sinistro pontual sem impacto regional.
- Retrospectiva/efeméride, crime, ação judicial, nota nacional sem localidade, ou assunto que não é desastre natural.

${FRESHNESS_RULE}

REGRAS DE SAÍDA (obrigatório):
- Responda SOMENTE com JSON válido, sem markdown/cercas/preâmbulo.
- Forma: {"resultados": [{"id": "<id>", "score": 0}]}
- Exatamente um objeto por notícia, repetindo o "id".`;

export function buildTriageUserPrompt(items: TriagePromptItem[], today: string): string {
  return `Hoje é ${today}. Pontue (0-100) cada notícia por RELEVÂNCIA e ATUALIDADE — dê score 0 se for antiga/desatualizada (regra de ATUALIDADE). Retorne um objeto por id no array "resultados".

NOTÍCIAS:
${JSON.stringify(items, null, 2)}`;
}
