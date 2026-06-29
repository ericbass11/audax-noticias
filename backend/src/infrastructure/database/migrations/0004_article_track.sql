-- Trilha da notícia: 'news' (fluxo normal agro) ou 'watchlist' (vigilância
-- regulatória, ex.: produtos proibidos pela ANVISA — janela ampla, sempre
-- relevante, cruzar com recebíveis/NFes antecipados).
ALTER TABLE "news_articles" ADD COLUMN IF NOT EXISTS "track" text NOT NULL DEFAULT 'news';
CREATE INDEX IF NOT EXISTS "news_articles_track_idx" ON "news_articles" ("track");
