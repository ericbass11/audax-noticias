-- Imagem da notícia (thumbnail vindo da fonte, ex.: SerpAPI google_news).
ALTER TABLE "news_articles" ADD COLUMN IF NOT EXISTS "image_url" text;
