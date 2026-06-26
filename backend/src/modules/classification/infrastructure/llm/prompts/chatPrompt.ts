export interface ChatContext {
  title: string;
  source: string;
  category: string | null;
  impact: string | null;
  executiveSummary: string;
  areas: Record<string, string>;
  actions: string[];
  /** Corpo do artigo (quando foi possível ler); null = paywall/indisponível. */
  body: string | null;
}

const AREA_LABEL: Record<string, string> = {
  comercial: 'Comercial/Originação',
  cobranca: 'Cobrança',
  operacoes: 'Operações',
  risco: 'Risco/Crédito',
  compliance: 'Compliance/Jurídico',
};

/**
 * Monta o system prompt do chat: a IA responde perguntas SOBRE esta notícia,
 * ancorada no texto do artigo e na análise por área já produzida para a Audax.
 */
export function buildChatSystemPrompt(ctx: ChatContext): string {
  const areasTxt = Object.entries(ctx.areas)
    .map(([k, v]) => `- ${AREA_LABEL[k] ?? k}: ${v}`)
    .join('\n');
  const actionsTxt = ctx.actions.map((a) => `- ${a}`).join('\n');

  return `Você é o assistente de análise da Audax Capital, uma FIDC de recebíveis do agronegócio. Você conversa com a equipe sobre UMA notícia específica, ajudando a extrair implicações para o negócio.

CONTEXTO DA NOTÍCIA
Título: ${ctx.title}
Fonte: ${ctx.source}${ctx.category ? `\nCategoria: ${ctx.category}` : ''}${ctx.impact ? `\nImpacto pré-avaliado: ${ctx.impact}` : ''}

Resumo executivo:
${ctx.executiveSummary}

Análise por área:
${areasTxt || '(sem detalhamento por área)'}

Ações sugeridas:
${actionsTxt || '(nenhuma)'}

${ctx.body ? `TEXTO COMPLETO DO ARTIGO:\n${ctx.body}` : 'OBS.: o texto completo do artigo não está disponível (fonte paga/inacessível). Baseie-se no resumo e na análise acima.'}

REGRAS:
- Responda em português do Brasil, de forma objetiva e profissional.
- Baseie-se SOMENTE no conteúdo acima. Se perguntarem algo que a notícia não cobre, diga claramente que a notícia não traz essa informação — não invente.
- Sempre que fizer sentido, conecte a resposta ao impacto para a FIDC (carteira de recebíveis agro, risco de crédito, originação, cobrança, operações, compliance).
- Seja conciso; use listas curtas quando ajudar.`;
}
