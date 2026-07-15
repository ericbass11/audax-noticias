# Deploy na VPS (Docker)

Sobe **todo** o sistema (Postgres, Redis, backend, Evolution/WhatsApp, portal Next
e Nginx) via Docker, atrás de um único Nginx na porta 80.

- Portal + API: `http://IP-DA-VPS`  (Nginx roteia `/` → portal e `/api` → backend)
- Evolution/QR (admin): `http://IP-DA-VPS:8080/manager`

## 1. Pré-requisitos na VPS
- Linux com **Docker** e **Docker Compose plugin** (`docker compose version`).
- Portas liberadas no firewall: **80** (portal) e **8080** (Evolution/QR).
- Fuso: o app usa `TZ=America/Sao_Paulo` (crons 08h/18h) independente do relógio do host.

## 2. Código + .env
```bash
git clone <repo> audax-noticias && cd audax-noticias
cp .env.example .env
```
Edite o `.env` e preencha:
- `ANTHROPIC_API_KEY` — chave da Anthropic.
- `SERPAPI_API_KEY` — chave do SerpAPI.
- `EVOLUTION_API_KEY` — gere uma forte: `openssl rand -hex 24`.
- `EVOLUTION_SERVER_URL=http://IP-DA-VPS:8080`
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
O backend aplica as migrations e sobe API + worker + cron. O banco `evolution` é
criado automaticamente na primeira subida.

Verificar:
```bash
docker compose -f docker-compose.prod.yml ps
docker compose -f docker-compose.prod.yml logs -f backend
```

## 4. Conectar o WhatsApp (uma vez)
1. Abra `http://IP-DA-VPS:8080/manager`
2. Cole o `EVOLUTION_API_KEY`.
3. Instância **audax** → escaneie o QR (WhatsApp → Aparelhos conectados).
4. Estado deve virar **open**. (Sessão persiste no volume `evolution-instances`.)

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
- Dados ficam nos volumes `postgres-data` (banco) e `evolution-instances` (sessão WhatsApp).
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
- **WhatsApp cai em quedas longas**: se a Evolution ficar dias fora, pode pedir
  re-scan do QR. Numa VPS sempre ligada isso é raro.
