-- Cria o banco dedicado da Evolution API na primeira inicialização do Postgres
-- (volume vazio). Roda automaticamente via /docker-entrypoint-initdb.d.
SELECT 'CREATE DATABASE evolution'
WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'evolution')\gexec
