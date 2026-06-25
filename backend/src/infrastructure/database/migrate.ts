import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { db, pool } from './client.js';

/**
 * Applies pending migrations from ./migrations and exits.
 * Invoked via `pnpm db:migrate` and by the docker-compose entrypoint.
 */
async function run(): Promise<void> {
  console.log('▶️  Aplicando migrations...');
  await migrate(db, { migrationsFolder: new URL('./migrations', import.meta.url).pathname });
  console.log('✅ Migrations aplicadas.');
  await pool.end();
}

run().catch((err) => {
  console.error('❌ Falha ao aplicar migrations:', err);
  process.exit(1);
});
