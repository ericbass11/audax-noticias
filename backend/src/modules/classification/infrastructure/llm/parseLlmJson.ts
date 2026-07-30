/**
 * Extração tolerante do JSON de uma resposta de LLM.
 *
 * Modelos não obedecem "responda SOMENTE com JSON": cercam em ```json, emendam
 * prosa DEPOIS do fechamento ("**Justificativa:** ...") ou põem preâmbulo antes.
 *
 * O parser anterior era `replace(/^```(?:json)?/,'').replace(/```$/,'')`, que
 * assumia que a cerca abria no início e fechava no FIM da string. Quando o
 * modelo escrevia qualquer coisa após o fechamento, o `JSON.parse` estourava e o
 * lote era tratado como falha — na triagem isso é pior que perder o lote, porque
 * o fail-open devolve score 100 e faz passar tudo. Em 30/07/2026 foi assim que
 * itens que o Haiku havia corretamente reprovado (scores 15, 0 e 25, corte 40)
 * entraram no digest do CEO.
 *
 * Ordem de tentativa: texto puro → conteúdo de cada cerca → primeiro
 * objeto/array balanceado no meio do texto.
 */
export function parseLlmJson(text: string): unknown | null {
  for (const candidate of jsonCandidates(text)) {
    try {
      return JSON.parse(candidate) as unknown;
    } catch {
      // Candidato inválido — tenta o próximo.
    }
  }
  return null;
}

function* jsonCandidates(text: string): Generator<string> {
  const trimmed = text.trim();
  if (trimmed.length === 0) return;

  yield trimmed;

  // Conteúdo de cada bloco cercado — o JSON não é necessariamente o primeiro.
  for (const match of trimmed.matchAll(/```(?:json)?\s*([\s\S]*?)```/gi)) {
    const inner = match[1]?.trim();
    if (inner) yield inner;
  }

  const balanced = firstBalanced(trimmed);
  if (balanced) yield balanced;
}

/**
 * Primeiro objeto/array balanceado do texto. Conta profundidade ignorando
 * chaves/colchetes dentro de string (e escapes), para não fechar cedo num
 * título que contenha "{" ou "]".
 */
function firstBalanced(text: string): string | null {
  const start = text.search(/[{[]/);
  if (start === -1) return null;

  const open = text[start];
  const close = open === '{' ? '}' : ']';
  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let i = start; i < text.length; i += 1) {
    const ch = text[i];

    if (inString) {
      if (escaped) escaped = false;
      else if (ch === '\\') escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }

    if (ch === '"') inString = true;
    else if (ch === open) depth += 1;
    else if (ch === close) {
      depth -= 1;
      if (depth === 0) return text.slice(start, i + 1);
    }
  }

  return null;
}
