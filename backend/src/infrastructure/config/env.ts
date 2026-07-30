import { z } from 'zod';

/**
 * Centralized, validated environment configuration.
 *
 * Every piece of sensitive/external config flows through here so the rest of
 * the codebase never reads `process.env` directly. Parsing fails fast at
 * startup if a required variable is missing or malformed.
 */

const csv = (value: string | undefined): string[] =>
  (value ?? '')
    .split(',')
    .map((item) => item.trim())
    .filter((item) => item.length > 0);

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().default(3333),
  TZ: z.string().default('America/Sao_Paulo'),
  WEB_APP_URL: z.string().url().default('http://localhost:3000'),

  DATABASE_URL: z.string().min(1, 'DATABASE_URL é obrigatório'),
  REDIS_URL: z.string().min(1, 'REDIS_URL é obrigatório'),

  CRON_ENABLED: z
    .string()
    .default('true')
    .transform((v) => v === 'true'),
  CRON_MORNING: z.string().default('0 8 * * *'),
  CRON_EVENING: z.string().default('0 18 * * *'),

  // Janela de recência: só entram notícias publicadas nas últimas N horas.
  // Evita coletar/classificar matérias antigas que as fontes devolvem junto.
  COLLECT_MAX_AGE_HOURS: z.coerce.number().default(24),

  // GNews — isolado atrás da interface NewsSource para troca futura.
  GNEWS_API_KEY: z.string().default(''),
  GNEWS_BASE_URL: z.string().url().default('https://gnews.io/api/v4'),
  GNEWS_COUNTRY: z.string().default('br'),
  GNEWS_LANG: z.string().default('pt'),
  GNEWS_QUERIES: z.string().default(''),

  RSS_FEEDS: z.string().default(''),

  // SerpAPI (engine google_news) — isolado atrás da interface NewsSource.
  SERPAPI_API_KEY: z.string().default(''),
  SERPAPI_BASE_URL: z.string().url().default('https://serpapi.com/search'),
  SERPAPI_GL: z.string().default('br'),
  SERPAPI_HL: z.string().default('pt-br'),
  SERPAPI_QUERIES: z.string().default(''),
  // Pacing p/ não estourar o rate limit (HTTP 429): espera entre requisições e
  // nº de tentativas com backoff quando o SerpAPI devolve 429.
  SERPAPI_DELAY_MS: z.coerce.number().default(2000),
  SERPAPI_MAX_RETRIES: z.coerce.number().default(4),

  // Vigilância regulatória (ex.: produtos proibidos pela ANVISA). Rota própria:
  // janela ampla, pula a triagem agro e sempre entra no portal/alertas.
  WATCHLIST_QUERIES: z.string().default(''),
  WATCHLIST_MAX_AGE_DAYS: z.coerce.number().default(30),

  // Mercado FIDC/factoring/securitização + regulação (CVM/BACEN/CMN). Rota
  // própria com digest e destinatário de WhatsApp SEPARADOS.
  FIDC_QUERIES: z.string().default(''),
  FIDC_MAX_AGE_DAYS: z.coerce.number().default(7),
  FIDC_MAX_ITEMS: z.coerce.number().default(60),
  // Após a triagem de relevância FIDC, quantas seguem para análise/digest.
  FIDC_MAX_ANALYZE: z.coerce.number().default(15),
  // Teto de itens da watchlist por ciclo (os mais recentes) — controla custo
  // de análise e o volume do portal, já que a rota não passa pela triagem.
  WATCHLIST_MAX_ITEMS: z.coerce.number().default(20),
  // Incluir o bloco de alertas ANVISA no WhatsApp? (false = só no portal).
  WHATSAPP_INCLUDE_WATCHLIST: z
    .string()
    .default('false')
    .transform((v) => v === 'true'),

  // Desastres climáticos em praças com Cedente/Sacado. As cidades vêm de um
  // banco EXTERNO (SQL Server); a trilha só roda se DISASTER_DB_SERVER e
  // DISASTER_CITIES_QUERY estiverem preenchidos (senão, desligada).
  DISASTER_DB_SERVER: z.string().default(''),
  DISASTER_DB_PORT: z.coerce.number().default(1433),
  DISASTER_DB_DATABASE: z.string().default(''),
  DISASTER_DB_USER: z.string().default(''),
  DISASTER_DB_PASSWORD: z.string().default(''),
  // On-prem SQL Server normalmente exige estes dois:
  DISASTER_DB_ENCRYPT: z
    .string()
    .default('true')
    .transform((v) => v === 'true'),
  DISASTER_DB_TRUST_CERT: z
    .string()
    .default('true')
    .transform((v) => v === 'true'),
  // Query que retorna as cidades com Cedente/Sacado (ex.: títulos > 10k),
  // ordenada por exposição desc. DEVE retornar colunas `cidade` e `uf`.
  DISASTER_CITIES_QUERY: z.string().default(''),
  // Termos de desastre combinados por cidade (OR). Estreitos p/ evitar incêndio
  // urbano (trem/prédio) — foco em eventos climáticos/agro.
  DISASTER_QUERY_TERMS: z
    .string()
    .default(
      'enchente,alagamento,inundação,seca,estiagem,temporal,vendaval,granizo,geada,deslizamento,incêndio florestal,queimada,incêndio em lavoura',
    ),
  // Teto de cidades pesquisadas por ciclo (as N primeiras da query) — controla
  // custo/limite do SerpAPI.
  DISASTER_MAX_CITIES: z.coerce.number().default(30),
  // Janela de recência (desastre é notícia fresca) e teto de itens analisados.
  DISASTER_MAX_AGE_HOURS: z.coerce.number().default(72),
  DISASTER_MAX_ANALYZE: z.coerce.number().default(15),
  // Teto de itens de desastre no BLOCO do digest (evita bloco gigante). Após o
  // dedup semântico, mostra no máximo estes (os de maior score da triagem).
  DISASTER_MAX_ITEMS: z.coerce.number().default(6),
  // Liga/desliga a trilha de desastres INTEIRA (coleta + bloco no digest).
  // DEFAULT `false` — desligada por ora: a relevância de risco de crédito por
  // praça ainda será reformulada (ver backlog), e a triagem é fail-open (se a
  // chamada ao LLM falha, o lote passa com score 100), o que já colocou item
  // irrelevante no digest do CEO. `false` = não coleta e não aparece no digest.
  // Só religue junto com a reformulação da relevância.
  DISASTER_ENABLED: z
    .string()
    .default('false')
    .transform((v) => v === 'true'),
  // Incluir o bloco de risco climático no digest do CEO? (default sim).
  INCLUDE_DISASTER_IN_SUMMARY: z
    .string()
    .default('true')
    .transform((v) => v === 'true'),
  // Rodar a trilha de desastres SÓ no ciclo da manhã (08h)? (default sim —
  // reduz custo do SerpAPI; à tarde a trilha é pulada).
  DISASTER_ONLY_MORNING: z
    .string()
    .default('true')
    .transform((v) => v === 'true'),

  // Liga/desliga a análise profunda das 5 áreas (1 chamada Sonnet por artigo,
  // lendo o corpo). Desligada economiza Sonnet; o resumo/digest do WhatsApp NÃO
  // depende disso (é determinístico) e o dedup histórico usa `surfaced_at`.
  ANALYSIS_ENABLED: z
    .string()
    .default('true')
    .transform((v) => v === 'true'),

  // Provedor de LLM: 'anthropic' chama o Claude direto; 'litellm' usa o gateway.
  LLM_PROVIDER: z.enum(['anthropic', 'litellm']).default('litellm'),

  // Anthropic direto (quando LLM_PROVIDER=anthropic).
  ANTHROPIC_API_KEY: z.string().default(''),
  ANTHROPIC_MODEL: z.string().default('claude-opus-4-8'),

  // Triagem barata (modelo leve) antes da classificação profunda. Pontua os
  // títulos e só os promissores seguem para o modelo caro.
  TRIAGE_MODEL: z.string().default('claude-haiku-4-5'),
  TRIAGE_MIN_SCORE: z.coerce.number().default(40),
  TRIAGE_MAX_TO_CLASSIFY: z.coerce.number().default(50),

  // Gate do resumo executivo (o que chega no WhatsApp do CEO).
  SUMMARY_MIN_RELEVANCE: z.coerce.number().default(65),
  SUMMARY_MAX_ITEMS: z.coerce.number().default(7),
  // false: dia sem nada acima do piso → não dispara nada (silêncio).
  SEND_ON_EMPTY: z
    .string()
    .default('false')
    .transform((v) => v === 'true'),

  // Gateway LiteLLM (quando LLM_PROVIDER=litellm).
  LITELLM_BASE_URL: z.string().url().default('http://localhost:4000'),
  LITELLM_API_KEY: z.string().default(''),
  LITELLM_MODEL: z.string().default('claude-general'),
  LLM_BATCH_SIZE: z.coerce.number().default(10),

  LANGFUSE_ENABLED: z
    .string()
    .default('false')
    .transform((v) => v === 'true'),
  LANGFUSE_PUBLIC_KEY: z.string().default(''),
  LANGFUSE_SECRET_KEY: z.string().default(''),
  LANGFUSE_BASE_URL: z.string().default('https://cloud.langfuse.com'),

  EVOLUTION_BASE_URL: z.string().url().default('http://localhost:8080'),
  // Sabor da Evolution: 'go' (Evolution GO/whatsmeow — o da VPS) ou 'v2'
  // (Baileys, `atendai/evolution-api` — o container do docker-compose local).
  // Muda o path dos endpoints e onde vem o id da mensagem. Ver EvolutionApiClient.
  EVOLUTION_API_FLAVOR: z.enum(['go', 'v2']).default('go'),
  // Só usado no sabor 'v2' (vai no path). No 'go' a instância vem do token.
  EVOLUTION_INSTANCE: z.string().default('audax'),
  EVOLUTION_API_KEY: z.string().default(''),
  EVOLUTION_RECIPIENTS: z.string().default(''),
  // Destinatários do 2º fluxo (mercado FIDC). Vazio = usa EVOLUTION_RECIPIENTS.
  EVOLUTION_RECIPIENTS_FIDC: z.string().default(''),
  // Destinatários do 3º fluxo (cotações de commodities). Vazio = usa EVOLUTION_RECIPIENTS.
  EVOLUTION_RECIPIENTS_COMMODITIES: z.string().default(''),
  // PREVIEW: se ligado, TODOS os fluxos vão primeiro para EVOLUTION_RECIPIENTS_PREVIEW
  // (número pessoal p/ validar) e, após PREVIEW_PROMOTE_DELAY_MINUTES, o mesmo
  // conteúdo é promovido para os destinatários reais (grupo). Desligado = envia
  // direto ao grupo (comportamento normal).
  EVOLUTION_RECIPIENTS_PREVIEW: z.string().default(''),
  PREVIEW_ENABLED: z
    .string()
    .default('false')
    .transform((v) => v === 'true'),
  PREVIEW_PROMOTE_DELAY_MINUTES: z.coerce.number().default(30),
  WHATSAPP_DISPATCH_ENABLED: z
    .string()
    .default('true')
    .transform((v) => v === 'true'),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error('❌ Configuração de ambiente inválida:');
  console.error(parsed.error.flatten().fieldErrors);
  process.exit(1);
}

const raw = parsed.data;

export const env = {
  ...raw,
  // Derivados: listas já parseadas a partir de CSV.
  gnewsQueries: csv(raw.GNEWS_QUERIES),
  rssFeeds: csv(raw.RSS_FEEDS),
  serpapiQueries: csv(raw.SERPAPI_QUERIES),
  watchlistQueries: csv(raw.WATCHLIST_QUERIES),
  fidcQueries: csv(raw.FIDC_QUERIES),
  disasterQueryTerms: csv(raw.DISASTER_QUERY_TERMS),
  evolutionRecipients: csv(raw.EVOLUTION_RECIPIENTS),
  evolutionRecipientsFidc: csv(raw.EVOLUTION_RECIPIENTS_FIDC),
  evolutionRecipientsCommodities: csv(raw.EVOLUTION_RECIPIENTS_COMMODITIES),
  evolutionRecipientsPreview: csv(raw.EVOLUTION_RECIPIENTS_PREVIEW),
  isProduction: raw.NODE_ENV === 'production',
};

export type Env = typeof env;
