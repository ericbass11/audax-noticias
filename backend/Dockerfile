# Backend — build + runtime numa imagem só (simples para rodar local).
FROM node:20-alpine AS base
RUN corepack enable && corepack prepare pnpm@9.0.0 --activate
WORKDIR /app

# Instala dependências a partir do manifesto.
COPY package.json ./
RUN pnpm install

# Copia o código e compila TypeScript -> dist/.
COPY . .
RUN pnpm build

# As migrations (.sql) ficam fora do dist do tsc; copiamos para o destino
# que migrate.ts espera em tempo de execução.
RUN mkdir -p dist/infrastructure/database/migrations \
  && cp -r src/infrastructure/database/migrations/* dist/infrastructure/database/migrations/

EXPOSE 3333
CMD ["node", "dist/main.js"]
