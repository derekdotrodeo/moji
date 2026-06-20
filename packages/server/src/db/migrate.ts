/** Apply Drizzle migrations, then exit. Run via `npm run db:migrate`. */
import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import postgres from 'postgres';
import { env } from '../env.js';

async function main() {
  const sql = postgres(env.databaseUrl, { max: 1 });
  const db = drizzle(sql);
  console.log('Running migrations…');
  await migrate(db, { migrationsFolder: './drizzle' });
  console.log('Migrations complete.');
  await sql.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
