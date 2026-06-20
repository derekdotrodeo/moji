import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { env } from '../env.js';
import * as schema from './schema.js';

/**
 * Shared Postgres connection + Drizzle instance. Postgres is used only for
 * durable data (content, completed games, analytics), never in the realtime
 * hot path.
 */
const queryClient = postgres(env.databaseUrl, { max: 10 });

export const db = drizzle(queryClient, { schema });
export { schema };
export type Db = typeof db;
