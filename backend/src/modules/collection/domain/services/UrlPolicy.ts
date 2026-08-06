/**
 * UrlPolicy — filtros DETERMINÍSTICOS de URL aplicados na coleta, antes de
 * qualquer LLM. Sem custo e sem depender de julgamento do modelo.
 *
 * Regra de segurança que vale para as duas funções: **na dúvida, MANTÉM a
 * notícia**. Lista de padrões vazia, URL inválida ou qualquer erro de parse
 * resultam em `false` (não bloqueia). Um filtro que falha nunca deve esvaziar o
 * digest — o pior caso é o comportamento de antes do filtro existir.
 */

/**
 * Padrões de URL de conteúdo PAGO/publicitário. Casam por substring, sem
 * acento e sem case. Motivação real: em 30/07/2026 o digest do CEO recebeu
 * "Evite Fechar as Portas: Gestão de Caixa para Empresas", que veio de
 * `campograndenews.com.br/conteudo-patrocinado/antecipacao-de-recebiveis-...`
 * — um anúncio que casou os termos da trilha FIDC justamente por ser
 * propaganda de antecipação de recebíveis.
 */
export const DEFAULT_SPONSORED_URL_PATTERNS = [
  'conteudo-patrocinado',
  'conteudo_patrocinado',
  '/patrocinado',
  'publieditorial',
  'publi-editorial',
  'informe-publicitario',
  'branded-content',
  'brandedcontent',
  'advertorial',
  '/publicidade/',
  'espaco-publicitario',
] as const;

/** Normaliza para comparação: minúsculas e sem diacríticos. */
function normalize(value: string): string {
  return value
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase();
}

/**
 * A URL é de conteúdo patrocinado/publicitário?
 * `patterns` vazio desliga o filtro.
 */
export function isSponsoredUrl(url: string, patterns: readonly string[]): boolean {
  if (patterns.length === 0) return false;
  const haystack = normalize(url);
  return patterns.some((pattern) => {
    const needle = normalize(pattern).trim();
    return needle.length > 0 && haystack.includes(needle);
  });
}

/**
 * O host da URL termina em um dos TLDs/domínios bloqueados?
 *
 * Usado para manter a trilha FIDC no mercado BRASILEIRO — em 30/07/2026 entrou
 * "Factoring: a ferramenta invisível da economia portuguesa" (`sapo.pt`), que
 * casa o núcleo do prompt mas não tem relevância operacional aqui.
 *
 * Compara por sufixo de host, então `pt` bloqueia `sapo.pt` e NÃO bloqueia
 * `algo.pt.br` nem `esporte.com.br`. URL inválida → não bloqueia.
 */
export function hasBlockedHostSuffix(url: string, blocked: readonly string[]): boolean {
  if (blocked.length === 0) return false;

  let host: string;
  try {
    host = new URL(url).hostname.toLowerCase();
  } catch {
    return false; // URL que não parseia não é bloqueada aqui (a coleta já exige url).
  }

  return blocked.some((raw) => {
    const suffix = raw.trim().toLowerCase().replace(/^\.+/, '');
    if (suffix.length === 0) return false;
    return host === suffix || host.endsWith(`.${suffix}`);
  });
}

/**
 * Troca a ORIGEM de uma URL, preservando caminho/query/hash.
 *
 * Motivação real: o feed do fidcnews.com.br (site do grupo) é gerado com a
 * origem interna do servidor — `http://127.0.0.1:3360/slug` —, então o link que
 * chegaria ao WhatsApp não abriria. O slug está certo; só a origem está errada.
 *
 * Reconstrói a URL a partir da origem nova em vez de atribuir `host`: o setter
 * `host` só troca a porta quando o valor novo traz uma, e a porta interna
 * (:3360) sobreviveria à reescrita.
 *
 * Tolerante: origem ausente/vazia, ou qualquer um dos dois lados não parseando
 * como URL, devolve o link ORIGINAL — a reescrita nunca perde um item.
 */
export function rewriteUrlOrigin(url: string, origin: string | undefined): string {
  if (!origin || origin.trim().length === 0) return url;
  try {
    const target = new URL(origin);
    const parsed = new URL(url);
    return new URL(`${parsed.pathname}${parsed.search}${parsed.hash}`, target).toString();
  } catch {
    return url;
  }
}
