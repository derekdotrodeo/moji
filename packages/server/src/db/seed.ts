/** CLI: seed categories + prompts into Postgres. Run via `npm run db:seed`. */
import { db } from './client.js';
import { seedDatabase } from './seedDatabase.js';

async function main() {
  const { categories, newPrompts } = await seedDatabase(db);
  console.log(`Seed complete: ${categories} categories, ${newPrompts} new prompts.`);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
