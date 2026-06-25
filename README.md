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
  Collection         ──▶  Classification (LiteLLM)  ──▶  PERSISTE  ──▶  Notification (WhatsApp)
  GNews+SerpAPI+RSS       impacto/relevância/justif.     Postgres        resumo p/ C-Level
  dedup por hash          + resumo executivo
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
| `SERPAPI_API_KEY` | coleta via SerpAPI (engine google_news) |
| `RSS_FEEDS` | URLs reais de feeds de agro/economia |
| `LITELLM_BASE_URL` / `LITELLM_API_KEY` / `LITELLM_MODEL` | gateway LiteLLM externo (ver abaixo) p/ classificação |
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

### Gateway de LLM (stack externa `audax-ai-gateway`)

Este projeto **não sobe o LiteLLM** — ele consome o **gateway de IA da empresa**
(stack separada: LiteLLM + Langfuse + Presidio). Suba o gateway primeiro; o
`docker-compose` daqui se conecta a ele pela rede externa `audax-ai-gateway_audax-gw`
e alcança o LiteLLM em `http://litellm:4000`. No `.env`, preencha apenas
`LITELLM_API_KEY` (uma *virtual key* emitida pelo gateway) e `LITELLM_MODEL`.

- As chaves reais de Anthropic/OpenAI/Gemini ficam no `.env` do **gateway**, não aqui.
- O LiteLLM já envia as chamadas ao **Langfuse** (auditoria/custo/latência) e o
  **Presidio** mascara PII antes de ir ao provedor — então observabilidade e LGPD
  já estão cobertas no gateway. Mantemos também `llm_audit_logs` como trilha local.
- **Desacoplar (opcional):** se não quiser usar a rede externa, remova a rede
  `gateway` do `docker-compose.yml` e aponte `LITELLM_BASE_URL=http://host.docker.internal:4000`.
- ⚠️ **Conflito de porta 3000:** o Langfuse do gateway publica em `:3000`, mesma
  porta do frontend Next em dev. Rode o frontend em outra porta (ex.: `next dev -p 3001`)
  se for usar a UI do Langfuse localmente ao mesmo tempo.

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

### Testar a captura das fontes (sem subir banco/fila)

Valida credenciais e mostra o que cada fonte retorna já normalizado, sem precisar
de Postgres/Redis:

```bash
cd backend
pnpm test:capture                 # roda GNews + RSS conforme o .env da raiz
pnpm test:capture --limit=10      # mostra até 10 itens por fonte
pnpm test:capture --classify      # + 1 chamada de teste ao LiteLLM (parsing do JSON)
pnpm test:capture --json          # imprime o array normalizado completo
```

O script ignora fontes sem credencial (ex.: sem `GNEWS_API_KEY` ele pula o GNews e
testa só o RSS) e imprime contagem de coletados / válidos / únicos após dedup.

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
- **LiteLLM, nunca provedor direto:** cliente compatível OpenAI/Anthropic apontado para o
  gateway externo. Forçamos JSON (`response_format`) e fazemos **parse defensivo** (`try/catch`).
  Enviamos `temperature` (0.2). ⚠️ **Opus 4.8/4.7 rejeitam `temperature` com erro 400** — então
  garanta `litellm_settings: drop_params: true` no `config.yaml` do gateway (ele descarta o
  parâmetro para os modelos que não o aceitam e mantém para o GPT). O fallback de modelo
  (Claude→GPT) também é responsabilidade do gateway, não do app.
- **Resumo com fallback:** se o LLM falhar ao redigir o resumo, há um texto determinístico de
  fallback — o disparo nunca fica sem conteúdo.
- **Auditoria + Langfuse:** o **gateway** já envia as chamadas ao Langfuse (custo/latência/prompts).
  No app, mantemos `llm_audit_logs` como trilha local; `AuditLogger.forwardToLangfuse` é um hook
  app-level opcional (no-op quando `LANGFUSE_ENABLED=false`).
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
