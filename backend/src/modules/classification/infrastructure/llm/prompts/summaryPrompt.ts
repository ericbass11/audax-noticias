import type { ScoredArticle } from '../../../domain/services/ExecutiveSummaryBuilder.js';

export const SUMMARY_PROMPT_VERSION = 'summary-v1';

export const SUMMARY_SYSTEM_PROMPT = `Você redige o resumo executivo diário de notícias para o C-Level (CEO e Diretora de Operações) de uma FIDC de recebíveis do agronegócio (Audax Capital).

Estilo obrigatório:
- Português do Brasil, tom direto e objetivo, sem floreio.
- Formato para WhatsApp: curto, uma linha por notícia.
- Use emojis discretos APENAS para sinalizar impacto: 🟢 positivo, 🔴 negativo, ⚪ neutro.
- Comece com um título curto. NÃO use markdown de cabeçalho (#). Pode usar *negrito* do WhatsApp.
- Cada linha deve, em poucas palavras, dizer a notícia e por que importa para a FIDC.
- Responda SOMENTE com o texto final da mensagem, sem JSON, sem cercas de código, sem comentários.`;

export function buildSummaryUserPrompt(top: ScoredArticle[], webAppUrl: string): string {
  const items = top.map((s, i) => ({
    ordem: i + 1,
    titulo: s.article.title,
    impacto: s.classification.impact,
    relevancia: s.classification.relevance,
    categoria: s.classification.category,
    justificativa: s.classification.justification,
    fonte: s.article.source,
  }));

  return `Gere o resumo executivo consolidado destas ${top.length} notícias de maior relevância do período.
Inclua, na ÚLTIMA linha, o link para a análise completa: ${webAppUrl}

NOTÍCIAS (já ordenadas por relevância):
${JSON.stringify(items, null, 2)}`;
}
