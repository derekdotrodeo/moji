/**
 * Seed categories + prompts (+ canonical/alias answers) into Postgres.
 * Idempotent on category slug + prompt answer. Run via `npm run db:seed`.
 */
import { eq } from 'drizzle-orm';
import { db } from './client.js';
import { categories, prompts, promptAnswers } from './schema.js';
import { SEED_CATEGORIES } from '../content/seedData.js';

async function main() {
  let nPrompts = 0;
  for (const [i, cat] of SEED_CATEGORIES.entries()) {
    const existing = await db.select().from(categories).where(eq(categories.slug, cat.slug));
    const categoryId =
      existing[0]?.id ??
      (
        await db
          .insert(categories)
          .values({
            slug: cat.slug,
            name: cat.name,
            description: cat.description,
            sortOrder: i,
          })
          .returning()
      )[0]!.id;

    for (const p of cat.prompts) {
      const dupe = await db
        .select({ id: prompts.id })
        .from(prompts)
        .where(eq(prompts.answer, p.answer));
      if (dupe.length > 0) continue;

      const inserted = (
        await db
          .insert(prompts)
          .values({
            categoryId,
            answer: p.answer,
            difficulty: p.difficulty,
            popularity: p.popularity,
            status: 'approved',
          })
          .returning()
      )[0]!;

      await db.insert(promptAnswers).values({
        promptId: inserted.id,
        text: p.answer,
        matchType: 'canonical',
      });
      for (const alias of p.aliases ?? []) {
        await db.insert(promptAnswers).values({
          promptId: inserted.id,
          text: alias,
          matchType: 'alias',
        });
      }
      nPrompts++;
    }
  }
  console.log(`Seed complete: ${SEED_CATEGORIES.length} categories, ${nPrompts} new prompts.`);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
