-- Sinal de "surfada" (notícia exposta em um digest/portal) independente da
-- análise profunda das 5 áreas. Base do dedup histórico entre dias: com a
-- análise desligável, "surfada" != "analisada". Nullable → seguro em base
-- com dados existentes.
ALTER TABLE "news_articles" ADD COLUMN IF NOT EXISTS "surfaced_at" timestamptz;
CREATE INDEX IF NOT EXISTS "news_articles_surfaced_at_idx" ON "news_articles" ("track","surfaced_at");
