import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
  uuid,
} from 'drizzle-orm/pg-core';

/**
 * Database schema (Drizzle).
 *
 * Design principle: the *raw normalized article* is kept separate from its
 * *classification result* so the LLM scoring can be re-run in the future
 * without re-collecting, while preserving a full audit trail.
 *
 *   news_articles (imutável) 1 ── N classifications (versionadas, is_current)
 *   news_articles            1 ── N llm_audit_logs
 *   processing_runs          1 ── N news_articles / executive_summaries
 *   executive_summaries      1 ── N summary_articles / dispatches
 */

// ---------------------------------------------------------------------------
// processing_runs — um "turno" de processamento (cron ou manual).
// `period_key` garante idempotência por data+período (ex.: 2026-06-25:morning).
// ---------------------------------------------------------------------------
export const processingRuns = pgTable('processing_runs', {
  id: uuid('id').defaultRandom().primaryKey(),
  periodKey: text('period_key').notNull().unique(),
  triggerType: text('trigger_type').notNull(), // 'scheduled' | 'manual'
  status: text('status').notNull().default('running'), // 'running' | 'completed' | 'failed'
  counts: jsonb('counts').$type<{
    collected?: number;
    deduped?: number;
    triaged?: number;
    classified?: number;
  }>(),
  error: text('error'),
  startedAt: timestamp('started_at', { withTimezone: true }).notNull().defaultNow(),
  finishedAt: timestamp('finished_at', { withTimezone: true }),
});

// ---------------------------------------------------------------------------
// news_articles — notícia bruta normalizada. Imutável após coleta.
// Dedup por `content_hash` = hash(normalize(title) + url).
// ---------------------------------------------------------------------------
export const newsArticles = pgTable(
  'news_articles',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    contentHash: text('content_hash').notNull(),
    title: text('title').notNull(),
    summary: text('summary'),
    url: text('url').notNull(),
    source: text('source').notNull(),
    sourceType: text('source_type').notNull(), // 'gnews' | 'rss'
    rawCategory: text('raw_category'),
    publishedAt: timestamp('published_at', { withTimezone: true }),
    collectedAt: timestamp('collected_at', { withTimezone: true }).notNull().defaultNow(),
    runId: uuid('run_id').references(() => processingRuns.id),
  },
  (table) => ({
    contentHashUnique: unique('news_articles_content_hash_unique').on(table.contentHash),
    publishedAtIdx: index('news_articles_published_at_idx').on(table.publishedAt),
  }),
);

// ---------------------------------------------------------------------------
// classifications — resultado do LLM. Versionável: uma notícia pode ter N
// classificações ao longo do tempo; `is_current` marca a vigente.
// ---------------------------------------------------------------------------
export const classifications = pgTable(
  'classifications',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    articleId: uuid('article_id')
      .notNull()
      .references(() => newsArticles.id, { onDelete: 'cascade' }),
    impact: text('impact').notNull(), // 'positivo' | 'negativo' | 'neutro'
    relevance: integer('relevance').notNull(), // 0..100
    category: text('category').notNull(),
    justification: text('justification').notNull(),
    model: text('model').notNull(),
    promptVersion: text('prompt_version').notNull(),
    isCurrent: boolean('is_current').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    articleIdx: index('classifications_article_idx').on(table.articleId),
    currentIdx: index('classifications_current_idx').on(table.isCurrent),
  }),
);

// ---------------------------------------------------------------------------
// article_analyses — análise PROFUNDA por notícia (lendo o corpo do artigo).
// Gera o conteúdo do PORTAL: resumo executivo + impacto por área da Audax +
// ações sugeridas. Versionável (is_current) como as classificações.
// `source_read` indica se conseguimos ler o texto completo (false = paywall/
// falha, análise feita só com título/resumo).
// ---------------------------------------------------------------------------
export const articleAnalyses = pgTable(
  'article_analyses',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    articleId: uuid('article_id')
      .notNull()
      .references(() => newsArticles.id, { onDelete: 'cascade' }),
    sourceRead: boolean('source_read').notNull().default(false),
    sourceChars: integer('source_chars'),
    executiveSummary: text('executive_summary').notNull(),
    // { comercial, cobranca, operacoes, risco, compliance }
    areas: jsonb('areas').$type<Record<string, string>>().notNull(),
    actions: jsonb('actions').$type<string[]>(),
    model: text('model').notNull(),
    promptVersion: text('prompt_version').notNull(),
    isCurrent: boolean('is_current').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    articleIdx: index('article_analyses_article_idx').on(table.articleId),
    currentIdx: index('article_analyses_current_idx').on(table.isCurrent),
  }),
);

// ---------------------------------------------------------------------------
// llm_audit_logs — trilha de auditoria de cada chamada ao LLM.
// Ponto de integração futura com Langfuse (ver AuditLogger).
// ---------------------------------------------------------------------------
export const llmAuditLogs = pgTable('llm_audit_logs', {
  id: uuid('id').defaultRandom().primaryKey(),
  articleId: uuid('article_id').references(() => newsArticles.id, { onDelete: 'set null' }),
  classificationId: uuid('classification_id').references(() => classifications.id, {
    onDelete: 'set null',
  }),
  prompt: text('prompt').notNull(),
  rawResponse: text('raw_response'),
  model: text('model').notNull(),
  latencyMs: integer('latency_ms'),
  tokensInput: integer('tokens_input'),
  tokensOutput: integer('tokens_output'),
  status: text('status').notNull(), // 'success' | 'parse_error' | 'error'
  errorMessage: text('error_message'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

// ---------------------------------------------------------------------------
// executive_summaries — resumo consolidado do batch (texto WhatsApp PT-BR).
// `period_key` único garante idempotência do resumo por turno.
// ---------------------------------------------------------------------------
export const executiveSummaries = pgTable('executive_summaries', {
  id: uuid('id').defaultRandom().primaryKey(),
  runId: uuid('run_id')
    .notNull()
    .references(() => processingRuns.id, { onDelete: 'cascade' }),
  periodKey: text('period_key').notNull().unique(),
  content: text('content').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

// ---------------------------------------------------------------------------
// summary_articles — quais notícias compõem um resumo, com ranking.
// ---------------------------------------------------------------------------
export const summaryArticles = pgTable(
  'summary_articles',
  {
    summaryId: uuid('summary_id')
      .notNull()
      .references(() => executiveSummaries.id, { onDelete: 'cascade' }),
    articleId: uuid('article_id')
      .notNull()
      .references(() => newsArticles.id, { onDelete: 'cascade' }),
    rank: integer('rank').notNull(),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.summaryId, table.articleId] }),
  }),
);

// ---------------------------------------------------------------------------
// dispatches — registro de envios WhatsApp. `unique(summary, recipient)`
// impede reenvio duplicado ao mesmo destinatário (idempotência de disparo).
// ---------------------------------------------------------------------------
export const dispatches = pgTable(
  'dispatches',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    summaryId: uuid('summary_id')
      .notNull()
      .references(() => executiveSummaries.id, { onDelete: 'cascade' }),
    recipient: text('recipient').notNull(),
    status: text('status').notNull().default('pending'), // 'pending' | 'sent' | 'failed'
    providerMessageId: text('provider_message_id'),
    attempts: integer('attempts').notNull().default(0),
    errorMessage: text('error_message'),
    sentAt: timestamp('sent_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    summaryRecipientUnique: unique('dispatches_summary_recipient_unique').on(
      table.summaryId,
      table.recipient,
    ),
  }),
);

export type NewsArticleRow = typeof newsArticles.$inferSelect;
export type ClassificationRow = typeof classifications.$inferSelect;
export type ArticleAnalysisRow = typeof articleAnalyses.$inferSelect;
export type ProcessingRunRow = typeof processingRuns.$inferSelect;
export type ExecutiveSummaryRow = typeof executiveSummaries.$inferSelect;
export type DispatchRow = typeof dispatches.$inferSelect;
