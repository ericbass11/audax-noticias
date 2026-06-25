-- Audax Notícias — schema inicial
-- Separa notícia bruta (news_articles) do resultado de classificação
-- (classifications), com trilha de auditoria (llm_audit_logs) e controle
-- de idempotência por período (processing_runs / executive_summaries).

CREATE TABLE IF NOT EXISTS "processing_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"period_key" text NOT NULL,
	"trigger_type" text NOT NULL,
	"status" text DEFAULT 'running' NOT NULL,
	"counts" jsonb,
	"error" text,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone,
	CONSTRAINT "processing_runs_period_key_unique" UNIQUE("period_key")
);
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "news_articles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"content_hash" text NOT NULL,
	"title" text NOT NULL,
	"summary" text,
	"url" text NOT NULL,
	"source" text NOT NULL,
	"source_type" text NOT NULL,
	"raw_category" text,
	"published_at" timestamp with time zone,
	"collected_at" timestamp with time zone DEFAULT now() NOT NULL,
	"run_id" uuid,
	CONSTRAINT "news_articles_content_hash_unique" UNIQUE("content_hash")
);
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "classifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"article_id" uuid NOT NULL,
	"impact" text NOT NULL,
	"relevance" integer NOT NULL,
	"category" text NOT NULL,
	"justification" text NOT NULL,
	"model" text NOT NULL,
	"prompt_version" text NOT NULL,
	"is_current" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "llm_audit_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"article_id" uuid,
	"classification_id" uuid,
	"prompt" text NOT NULL,
	"raw_response" text,
	"model" text NOT NULL,
	"latency_ms" integer,
	"tokens_input" integer,
	"tokens_output" integer,
	"status" text NOT NULL,
	"error_message" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "executive_summaries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"run_id" uuid NOT NULL,
	"period_key" text NOT NULL,
	"content" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "executive_summaries_period_key_unique" UNIQUE("period_key")
);
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "summary_articles" (
	"summary_id" uuid NOT NULL,
	"article_id" uuid NOT NULL,
	"rank" integer NOT NULL,
	CONSTRAINT "summary_articles_summary_id_article_id_pk" PRIMARY KEY("summary_id","article_id")
);
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "dispatches" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"summary_id" uuid NOT NULL,
	"recipient" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"provider_message_id" text,
	"attempts" integer DEFAULT 0 NOT NULL,
	"error_message" text,
	"sent_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "dispatches_summary_recipient_unique" UNIQUE("summary_id","recipient")
);
--> statement-breakpoint

DO $$ BEGIN
 ALTER TABLE "news_articles" ADD CONSTRAINT "news_articles_run_id_processing_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "processing_runs"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint

DO $$ BEGIN
 ALTER TABLE "classifications" ADD CONSTRAINT "classifications_article_id_news_articles_id_fk" FOREIGN KEY ("article_id") REFERENCES "news_articles"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint

DO $$ BEGIN
 ALTER TABLE "llm_audit_logs" ADD CONSTRAINT "llm_audit_logs_article_id_news_articles_id_fk" FOREIGN KEY ("article_id") REFERENCES "news_articles"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint

DO $$ BEGIN
 ALTER TABLE "llm_audit_logs" ADD CONSTRAINT "llm_audit_logs_classification_id_classifications_id_fk" FOREIGN KEY ("classification_id") REFERENCES "classifications"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint

DO $$ BEGIN
 ALTER TABLE "executive_summaries" ADD CONSTRAINT "executive_summaries_run_id_processing_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "processing_runs"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint

DO $$ BEGIN
 ALTER TABLE "summary_articles" ADD CONSTRAINT "summary_articles_summary_id_executive_summaries_id_fk" FOREIGN KEY ("summary_id") REFERENCES "executive_summaries"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint

DO $$ BEGIN
 ALTER TABLE "summary_articles" ADD CONSTRAINT "summary_articles_article_id_news_articles_id_fk" FOREIGN KEY ("article_id") REFERENCES "news_articles"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint

DO $$ BEGIN
 ALTER TABLE "dispatches" ADD CONSTRAINT "dispatches_summary_id_executive_summaries_id_fk" FOREIGN KEY ("summary_id") REFERENCES "executive_summaries"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "news_articles_published_at_idx" ON "news_articles" ("published_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "classifications_article_idx" ON "classifications" ("article_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "classifications_current_idx" ON "classifications" ("is_current");
