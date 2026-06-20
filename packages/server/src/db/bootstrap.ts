/**
 * Startup database bootstrap: apply migrations, then seed content if the DB is
 * empty. Runs from COMPILED code (no tsx / no src/ needed in the production
 * image), and is fully NON-FATAL — if Postgres is unreachable the server still
 * boots and runs on the bundled content fallback.
 *
 * Idempotent: migrations are tracked by Drizzle; seeding is skipped when
 * categories already exist.
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import { db } from './client.js';
import { seedDatabase } from './seedDatabase.js';

export async function migrateAndSeed(): Promise<void> {
  // dist layout: packages/server/dist/db/bootstrap.js -> ../../drizzle
  const migrationsFolder = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../drizzle');
  try {
    await migrate(db, { migrationsFolder });
    // Seed is idempotent and also reconciles active categories, so run it every
    // boot — content edits in seedData take effect on the next deploy.
    const { newPrompts } = await seedDatabase(db);
    console.log(`[db] migrated; ${newPrompts} new prompts added, content reconciled`);
  } catch (err) {
    console.warn('[db] migrate/seed skipped (running on bundled content):', (err as Error).message);
  }
}
