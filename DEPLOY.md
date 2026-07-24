# Deploy na VPS (Docker)

Sobe Postgres, Redis, backend, portal Next e Nginx via Docker, atrás de um único
Nginx na porta 80. **A Evolution API NÃO é subida por este stack** — ela já roda
na VPS; o backend apenas se conecta à existente.

- Portal + API: `http://IP-DA-VPS`  (Nginx roteia `/` → portal e `/api` → backend)
- WhatsApp/QR: na **sua Evolution já existente** (não é gerenciada aqui).

## 1. Pré-requisitos na VPS
- Linux com **Docker** e **Docker Compose plugin** (`docker compose version`).
- Porta liberada no firewall: **80** (portal). A Evolution já tem a porta dela.
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
- **Evolution existente** (o backend se conecta a ela):
  - `EVOLUTION_BASE_URL` — URL da sua Evolution vista de dentro dos containers.
    Se ela está publicada na porta 8080 do host da VPS, use
    `http://host.docker.internal:8080` (o compose já mapeia esse host).
  - `EVOLUTION_API_KEY` — a **mesma** chave (AUTHENTICATION_API_KEY) da sua Evolution.
  - `EVOLUTION_INSTANCE` — o **nome da instância** já conectada (ex.: `audax`).
- `WEB_APP_URL=http://IP-DA-VPS`
- `POSTGRES_PASSWORD` — troque a senha padrão.
- Destinatários (quando for pra valer):
  - `EVOLUTION_RECIPIENTS` — digest de notícias (CEO).
  - `EVOLUTION_RECIPIENTS_FIDC` — mercado FIDC (vazio = usa o de cima).
  - `EVOLUTION_RECIPIENTS_COMMODITIES` — cotações (vazio = usa o de cima).
  - Formato: número `5511999999999` ou grupo `...@g.us`, separados por vírgula.
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
# de dentro do container do backend, checar o estado da instância
docker compose -f docker-compose.prod.yml exec backend \
  node -e "fetch(process.env.EVOLUTION_BASE_URL+'/instance/connectionState/'+process.env.EVOLUTION_INSTANCE,{headers:{apikey:process.env.EVOLUTION_API_KEY}}).then(r=>r.json()).then(d=>console.log(JSON.stringify(d))).catch(e=>console.log('ERRO',e.message))"
```
Esperado: `{"instance":{"instanceName":"...","state":"open"}}`. Se der erro de
conexão, ajuste `EVOLUTION_BASE_URL` (a Evolution precisa estar acessível a partir
do container — `host.docker.internal:8080` cobre o caso dela estar publicada no host).

## 5. Testar
- Portal: `http://IP-DA-VPS`
- Disparo manual de um ciclo:
```bash
curl -X POST http://IP-DA-VPS/api/trigger -H 'Content-Type: application/json' -d '{"force":true}'
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
