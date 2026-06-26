-- Audax Notícias — análise profunda por notícia (conteúdo do portal).
-- Resumo executivo + impacto por área da Audax + ações sugeridas, gerado a
-- partir da leitura do corpo do artigo. Versionável (is_current).

CREATE TABLE IF NOT EXISTS "article_analyses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"article_id" uuid NOT NULL,
	"source_read" boolean DEFAULT false NOT NULL,
	"source_chars" integer,
	"executive_summary" text NOT NULL,
	"areas" jsonb NOT NULL,
	"actions" jsonb,
	"model" text NOT NULL,
	"prompt_version" text NOT NULL,
	"is_current" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint

DO $$ BEGIN
 ALTER TABLE "article_analyses" ADD CONSTRAINT "article_analyses_article_id_news_articles_id_fk" FOREIGN KEY ("article_id") REFERENCES "news_articles"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "article_analyses_article_idx" ON "article_analyses" ("article_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "article_analyses_current_idx" ON "article_analyses" ("is_current");
