-- Guarda o corpo extraído do artigo junto da análise, para embasar o chat
-- (conversa com a IA sobre a notícia) sem precisar rebuscar a página.
ALTER TABLE "article_analyses" ADD COLUMN IF NOT EXISTS "source_text" text;
