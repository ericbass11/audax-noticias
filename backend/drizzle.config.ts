import { defineConfig } from 'drizzle-kit';

/**
 * drizzle-kit reads DATABASE_URL from the process env. Run migrations with:
 *   pnpm db:generate   # gera SQL a partir do schema.ts
 *   pnpm db:migrate    # aplica as migrations no banco
 */
export default defineConfig({
  schema: './src/infrastructure/database/schema.ts',
  out: './src/infrastructure/database/migrations',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.DATABASE_URL ?? 'postgresql://audax:audax@localhost:5432/audax_noticias',
  },
  verbose: true,
  strict: true,
});
