# Audax Notícias — Radar de Notícias para FIDC de recebíveis agro

Serviço de monitoramento de notícias da **Audax Capital** (FIDC de recebíveis com
exposição ao agronegócio). Coleta notícias 2x ao dia, classifica o impacto de cada
uma para as operações da FIDC via LLM, persiste tudo, envia um **resumo executivo no
WhatsApp** para o C-Level e alimenta um **dashboard web**.

> Tudo em código — sem n8n. Backend Node/TypeScript/Fastify, fila BullMQ+Redis,
> Postgres, frontend Next.js. Arquitetura em **DDD** (bounded contexts).

---

## Sumário da arquitetura

```
                 ┌──────────── node-cron (08:00 / 18:00 BRT) ────────────┐
                 │                                                        │
  POST /api/trigger ──202──▶  Fila BullMQ (Redis)  ──▶  Worker (mesmo processo)
                                                              │
        ┌─────────────────────────────────────────────────────┘
        ▼
  Collection  ──▶  Classification (LiteLLM)  ──▶  PERSISTE  ──▶  Notification (Evolution/WhatsApp)
  GNews + RSS      impacto/relevância/justif.     Postgres        resumo executivo p/ C-Level
  dedup por hash   + resumo executivo
        │                                            │
        └────────────────────────────────────────────┴──▶  API REST  ──▶  Dashboard Next.js
```

**Bounded contexts (DDD):** `collection`, `classification`, `notification`, `shared`.
Cada um com camadas `domain` (puro) / `application` (use cases) / `infrastructure`.
O orquestrador `RunNewsCycleUseCase` costura o ciclo de um turno.

### Modelo de dados (separação intencional)

A **notícia bruta** (`news_articles`) é separada do **resultado de classificação**
(`classifications`, versionado por `is_current`), permitindo **reprocessar o scoring**
no futuro sem recoletar. Há trilha de **auditoria** de LLM (`llm_audit_logs`), controle
de **idempotência por turno** (`processing_runs`, `executive_summaries` com `period_key`)
e registro de **disparos** WhatsApp (`dispatches`, único por destinatário).

---

## Pré-requisitos

- **Docker + Docker Compose** (caminho recomendado), ou
- **Node.js ≥ 20** + **pnpm 9** + Postgres 16 + Redis 7 locais.

Credenciais que **você precisa fornecer** (estão como placeholders no `.env.example`):

| Variável | Para quê |
|---|---|
| `GNEWS_API_KEY` | coleta via GNews (gnews.io) |
| `RSS_FEEDS` | URLs reais de feeds de agro/economia |
| `LITELLM_BASE_URL` / `LITELLM_API_KEY` / `LITELLM_MODEL` | gateway LiteLLM p/ classificação |
| `EVOLUTION_BASE_URL` / `EVOLUTION_INSTANCE` / `EVOLUTION_API_KEY` | WhatsApp |
| `EVOLUTION_RECIPIENTS` | grupos/contatos que recebem o resumo |

---

## Subir com Docker (recomendado)

```bash
# 1. Configure o ambiente
cp .env.example .env
#    edite o .env e preencha as credenciais marcadas com >>> PREENCHER <<<

# 2. Suba Postgres + Redis + backend (aplica migrations automaticamente)
docker compose up --build
```

- API: <http://localhost:3333> (`GET /health` para checar).
- O backend aplica as migrations no start (`pnpm db:migrate`) e sobe API + worker + cron.

O **frontend** roda fora do compose (dev):

```bash
cd frontend
cp .env.example .env.local           # NEXT_PUBLIC_API_URL=http://localhost:3333
pnpm install
pnpm dev                             # http://localhost:3000
```

---

## Subir sem Docker (local)

```bash
# Postgres e Redis precisam estar rodando localmente.
# Ajuste DATABASE_URL/REDIS_URL no .env para localhost.
cp .env.example .env

pnpm install                         # instala backend + frontend (workspace)

# Banco
pnpm --filter @audax/backend db:migrate

# Backend (API + worker + cron)
pnpm dev:backend                     # http://localhost:3333

# Frontend (outro terminal)
pnpm dev:frontend                    # http://localhost:3000
```

---

## Como usar

- **Automático:** o cron dispara 08:00 e 18:00 (BRT). Cada disparo enfileira um ciclo.
- **Sob demanda:** `POST /api/trigger` (responde **202**, processa em background).
  Opcional no body: `{ "period": "morning" | "evening", "force": true }`.
- **Dashboard:** abra <http://localhost:3000>, filtre por data/categoria, clique
  **"Coletar agora"** para disparar um ciclo manual.

### Endpoints

| Método | Rota | Descrição |
|---|---|---|
| `GET` | `/health` | healthcheck |
| `POST` | `/api/trigger` | enfileira um ciclo (202) |
| `GET` | `/api/news?date=YYYY-MM-DD&category=&limit=` | feed do dashboard |
| `GET` | `/api/news/categories` | categorias para o filtro |
| `GET` | `/api/summaries/:periodKey` | resumo + status dos disparos (`periodKey` = `YYYY-MM-DD:morning\|evening`) |
| `POST` | `/api/summaries/resend` | **reenvio manual** do resumo (202). Body: `{ "periodKey": "...", "force": false }` |

---

## Decisões e tradeoffs (honestidade)

- **Idempotência em camadas:** `jobId=cycle:<periodKey>` na fila + `processing_runs.period_key`
  (não reprocessa turno concluído) + `unique(summary_id, recipient)` (não reenvia). Rodar 2x
  no mesmo turno não duplica mensagem.
- **Disparo só após persistir:** se o WhatsApp falhar, os dados já estão salvos e visíveis no
  dashboard; use `/api/summaries/resend` para reenviar.
- **GNews trocável:** isolado atrás da interface `NewsSource` — trocar por NewsData.io é
  escrever outra implementação. O plano free do GNews limita resultados/rate; fazemos 1
  request por termo de `GNEWS_QUERIES`.
- **LiteLLM, nunca provedor direto:** cliente compatível OpenAI/Anthropic. Forçamos JSON
  (`response_format`) e fazemos **parse defensivo** (`try/catch`). Se o seu modelo não suportar
  `response_format`, o prompt ainda exige "somente JSON".
- **Resumo com fallback:** se o LLM falhar ao redigir o resumo, há um texto determinístico de
  fallback — o disparo nunca fica sem conteúdo.
- **Auditoria + Langfuse:** toda chamada de LLM é gravada em `llm_audit_logs`. O
  `AuditLogger.forwardToLangfuse` é o **hook preparado** para integrar Langfuse depois
  (hoje no-op quando `LANGFUSE_ENABLED=false`).
- **Evolution API:** o payload varia entre versões; implementamos o formato v2
  (`{ number, text }`) isolado em `EvolutionApiClient.buildBody()` — ponto único de ajuste.
- **Processo único:** API + worker + cron rodam juntos (deploy local simples). Para escalar,
  dá para separar em processos reusando o mesmo composition root (`container.ts`).
- **`WHATSAPP_DISPATCH_ENABLED=false`** em dev simula o envio (loga, não chama a Evolution).

---

## Estrutura do monorepo

```
audax-noticias/
├── docker-compose.yml · .env.example · README.md
├── backend/   (Fastify + BullMQ + Drizzle/Postgres + node-cron)
│   └── src/
│       ├── application/        # orquestração + read models (CQRS)
│       ├── modules/{collection,classification,notification,shared}/
│       │     domain · application · infrastructure
│       └── infrastructure/     # config, database, queue, cron, http, container (DI)
└── frontend/  (Next.js + Tailwind + shadcn/ui + Recharts)
```

## Scripts úteis

```bash
pnpm db:generate     # gera migration a partir do schema Drizzle (alterações futuras)
pnpm db:migrate      # aplica migrations
pnpm build           # build de backend + frontend
```
