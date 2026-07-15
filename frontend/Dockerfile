# Frontend Next.js — build + runtime (produção). Imagem única, simples de rodar.
FROM node:20-alpine
RUN corepack enable && corepack prepare pnpm@9.0.0 --activate
WORKDIR /app

# Dependências a partir do manifesto.
COPY package.json ./
RUN pnpm install

# Código + build de produção.
COPY . .
# URL pública da API embutida no bundle do CLIENTE (chat, etc.). Vazio = mesma
# origem: o Nginx serve o portal e roteia /api → backend. Setado via build-arg
# no docker-compose.prod.yml.
ARG NEXT_PUBLIC_API_URL=""
ENV NEXT_PUBLIC_API_URL=${NEXT_PUBLIC_API_URL}
ENV NEXT_TELEMETRY_DISABLED=1
RUN pnpm build

EXPOSE 3000
CMD ["pnpm", "start"]
