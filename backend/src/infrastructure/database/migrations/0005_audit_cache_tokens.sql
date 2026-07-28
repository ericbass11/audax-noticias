-- Tokens de cache de prompt (prompt caching) na trilha de auditoria do LLM:
-- leitura do prefixo cacheado (cache_read) e escrita/criação do cache
-- (cache_creation). Nullable → seguro em base com dados existentes.
ALTER TABLE "llm_audit_logs" ADD COLUMN IF NOT EXISTS "tokens_cache_read" integer;
ALTER TABLE "llm_audit_logs" ADD COLUMN IF NOT EXISTS "tokens_cache_write" integer;
