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

  // Vigilância regulatória (ex.: produtos proibidos pela ANVISA). Rota própria:
  // janela ampla, pula a triagem agro e sempre entra no portal/alertas.
  WATCHLIST_QUERIES: z.string().default(''),
  WATCHLIST_MAX_AGE_DAYS: z.coerce.number().default(30),

  // Mercado FIDC/factoring/securitização + regulação (CVM/BACEN/CMN). Rota
  // própria com digest e destinatário de WhatsApp SEPARADOS.
  FIDC_QUERIES: z.string().default(''),
  FIDC_MAX_AGE_DAYS: z.coerce.number().default(7),
  FIDC_MAX_ITEMS: z.coerce.number().default(20),
  // Teto de itens da watchlist por ciclo (os mais recentes) — controla custo
  // de análise e o volume do portal, já que a rota não passa pela triagem.
  WATCHLIST_MAX_ITEMS: z.coerce.number().default(20),
  // Incluir o bloco de alertas ANVISA no WhatsApp? (false = só no portal).
  WHATSAPP_INCLUDE_WATCHLIST: z
    .string()
    .default('false')
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
  EVOLUTION_INSTANCE: z.string().default('audax'),
  EVOLUTION_API_KEY: z.string().default(''),
  EVOLUTION_RECIPIENTS: z.string().default(''),
  // Destinatários do 2º fluxo (mercado FIDC). Vazio = usa EVOLUTION_RECIPIENTS.
  EVOLUTION_RECIPIENTS_FIDC: z.string().default(''),
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
  evolutionRecipients: csv(raw.EVOLUTION_RECIPIENTS),
  evolutionRecipientsFidc: csv(raw.EVOLUTION_RECIPIENTS_FIDC),
  isProduction: raw.NODE_ENV === 'production',
};

export type Env = typeof env;
