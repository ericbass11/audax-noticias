# Deploy na VPS (Docker)

Sobe Postgres, Redis, backend, portal Next e Nginx via Docker, atrás de um único
Nginx na porta **8090** (a VPS já usa 80/81/443 no nginx-proxy-manager).
**A Evolution API NÃO é subida por este stack** — ela já roda na VPS; o backend
apenas se conecta à existente.

- Portal + API: `http://IP-DA-VPS:8090`  (Nginx roteia `/` → portal e `/api` → backend)
- Opcional: em vez da 8090, aponte um **Proxy Host** do nginx-proxy-manager
  (admin em `:81`) para `audax-nginx:80` e sirva por um domínio/HTTPS.
- WhatsApp/QR: na **sua Evolution já existente** (não é gerenciada aqui).

## 1. Pré-requisitos na VPS
- Linux com **Docker** e **Docker Compose plugin** (`docker compose version`).
- Porta livre no host: **8090** (portal). 80/81/443 estão com o nginx-proxy-manager;
  se preferir servir por domínio/HTTPS, use o NPM em vez de abrir a 8090 no firewall.
- **Evolution API já online e conectada** (instância WhatsApp em estado `open`),
  acessível a partir dos containers (ex.: publicada na porta 8080 do host).
- Fuso: o app usa `TZ=America/Sao_Paulo` (crons 08h/18h) independente do relógio do host.

## 2. Código + .env
```bash
git clone <repo> audax-noticias && cd audax-noticias
cp .env.example .env
```
Edite o `.env` e preencha:
- `ANTHROPIC_API_KEY` — chave da Anthropic.
- `SERPAPI_API_KEY` — chave do SerpAPI.
- **Evolution existente** (o backend se conecta a ela) — hoje a VPS roda
  **Evolution GO** (whatsmeow), que tem endpoints diferentes da v2/Baileys:
  - `EVOLUTION_API_FLAVOR=go` — obrigatório na VPS. O sabor define o path
    (`/send/text` no `go` vs `/message/sendText/{instance}` na `v2`).
  - `EVOLUTION_BASE_URL=http://164.152.36.194:3300` — URL da Evolution GO. De
    dentro do container, `http://host.docker.internal:3300` também funciona (o
    compose já mapeia esse host).
  - `EVOLUTION_API_KEY` — o **token da instância** na Evolution GO (é ele que
    identifica a instância; vai no header `apikey`).
  - `EVOLUTION_INSTANCE` — **ignorado no sabor `go`** (a instância vem do token).
    Só importa se você voltar para a `v2`.
- `WEB_APP_URL=http://IP-DA-VPS:8090` (ou o domínio, se usar o nginx-proxy-manager)
- `POSTGRES_PASSWORD` — troque a senha padrão.
- Destinatários (quando for pra valer):
  - `EVOLUTION_RECIPIENTS` — digest de notícias (CEO).
  - `EVOLUTION_RECIPIENTS_FIDC` — mercado FIDC (vazio = usa o de cima).
  - `EVOLUTION_RECIPIENTS_COMMODITIES` — cotações (vazio = usa o de cima).
  - Formato: grupo `...@g.us` ou número `5511999999999`, separados por vírgula.
  - ⚠️ **Na Evolution GO atual, use SOMENTE grupo.** Envio 1:1 para número falha
    com `HTTP 500 {"error":"server returned error 463"}`
    (`NackCallerReachoutTimelocked`) — inclusive para contato com histórico. É bug
    aberto do Evolution GO (privacy tokens `tctoken`/`cstoken` nunca persistidos):
    https://github.com/evolution-foundation/evolution-go/issues/50
    Enquanto não atualizar/re-pairear a instância, número puro não recebe.
    Para "mandar só pra mim", crie um grupo com você + a instância.
- `WHATSAPP_DISPATCH_ENABLED=true` para enviar de verdade.

> As queries (GNews em standby, SerpAPI, WATCHLIST/ANVISA, FIDC) já vêm com
> valores bons no `.env.example` — ajuste se quiser.

## 3. Subir
```bash
docker compose -f docker-compose.prod.yml up -d --build
```
O backend aplica as migrations e sobe API + worker + cron.

Verificar:
```bash
docker compose -f docker-compose.prod.yml ps
docker compose -f docker-compose.prod.yml logs -f backend
```

## 4. Conferir a conexão com a Evolution existente
Não há QR para escanear aqui — a Evolution já está conectada. Só confirme que o
backend a alcança e que a instância/chave batem:
```bash
# de dentro do container do backend, checar o estado da instância (Evolution GO)
docker compose -f docker-compose.prod.yml exec backend \
  node -e "fetch(process.env.EVOLUTION_BASE_URL.replace(/\/+$/,'')+'/instance/status',{headers:{apikey:process.env.EVOLUTION_API_KEY}}).then(r=>r.json()).then(d=>console.log(JSON.stringify(d))).catch(e=>console.log('ERRO',e.message))"
```
Esperado: `{"data":{"Connected":true,"LoggedIn":true,"Name":"..."},"message":"success"}`.

- `{"error":"not authorized"}` → `EVOLUTION_API_KEY` errado (token da instância).
- Erro de conexão → ajuste `EVOLUTION_BASE_URL` (a Evolution precisa estar
  acessível a partir do container — `host.docker.internal:3300` cobre o caso
  dela estar publicada no host).
- `404` em `/send/text` na hora do disparo → `EVOLUTION_API_FLAVOR` está como
  `v2` mas a Evolution é GO (ou vice-versa).

> Na `v2` (Baileys) esse mesmo check é
> `/instance/connectionState/{instance}` e devolve `{"instance":{...,"state":"open"}}`.

## 5. Testar
- Portal: `http://IP-DA-VPS:8090`
- Disparo manual de um ciclo:
```bash
curl -X POST http://IP-DA-VPS:8090/api/trigger -H 'Content-Type: application/json' -d '{"force":true}'
```
- Os crons rodam sozinhos às **08h e 18h** (BRT). Como a VPS fica ligada, não há
  disparos perdidos (diferente do notebook).

## 6. Atualizar (deploy de nova versão)
```bash
git pull
docker compose -f docker-compose.prod.yml up -d --build
```

## 7. Backup / manutenção
- Dados ficam no volume `postgres-data` (banco da aplicação). A sessão WhatsApp
  fica na **sua Evolution** (fora deste stack — faça o backup dela à parte).
- Backup do Postgres:
```bash
docker compose -f docker-compose.prod.yml exec postgres \
  pg_dump -U audax audax_noticias > backup_$(date +%F).sql
```

## Notas
- **HTTPS**: este setup é HTTP interno. Para expor externamente, ponha um proxy
  TLS (Caddy/Traefik/Let's Encrypt) na frente do Nginx e ajuste as URLs.
- **Cotações de commodities**: fonte gratuita (CEPEA/ESALQ via Notícias Agrícolas),
  best-effort — se o site mudar o HTML, o boletim pode falhar; trocar por provedor
  oficial é só reimplementar `CommodityQuotesFetcher`.
- **Evolution externa**: este stack não gerencia a Evolution. Se ela cair ou
  trocar de porta/instância, ajuste `EVOLUTION_BASE_URL`/`EVOLUTION_INSTANCE` no
  `.env` e `docker compose ... up -d` de novo.
