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

  // LLM via gateway LiteLLM (compatível OpenAI/Anthropic). Nunca provedor direto.
  LITELLM_BASE_URL: z.string().url().default('http://localhost:4000'),
  LITELLM_API_KEY: z.string().default(''),
  LITELLM_MODEL: z.string().default('claude-opus-4-8'),
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
  evolutionRecipients: csv(raw.EVOLUTION_RECIPIENTS),
  isProduction: raw.NODE_ENV === 'production',
};

export type Env = typeof env;
