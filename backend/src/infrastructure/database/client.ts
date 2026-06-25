import { drizzle } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import { env } from '../config/env.js';
import * as schema from './schema.js';

/**
 * Single shared PostgreSQL connection pool + Drizzle instance.
 * The composition root wires this into repositories; the domain never sees it.
 */
const pool = new pg.Pool({
  connectionString: env.DATABASE_URL,
  max: 10,
});

export const db = drizzle(pool, { schema });
export type Database = typeof db;
export { pool, schema };
