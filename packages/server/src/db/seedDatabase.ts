/**
 * Seed/upsert categories + prompts (+ canonical/alias answers) into Postgres.
 * Safe to run on every boot:
 *   - new prompts are inserted,
 *   - an existing answer that moved to a different category is RE-HOMED and its
 *     aliases refreshed (so a content restructure applies without wiping the DB),
 *   - categories absent from the seed are deactivated (ContentProvider only
 *     loads active categories).
 * Shared by the `db:seed` CLI and the startup bootstrap.
 */
import { eq, inArray, notInArray } from 'drizzle-orm';
import type { Db } from './client.js';
import { categories, promptAnswers, prompts } from './schema.js';
import { SEED_CATEGORIES } from '../content/seedData.js';

export async function seedDatabase(db: Db): Promise<{ categories: number; newPrompts: number }> {
  // Ensure each umbrella category exists; collect slug -> id.
  const categoryId = new Map<string, string>();
  for (const [i, cat] of SEED_CATEGORIES.entries()) {
    const existing = await db.select().from(categories).where(eq(categories.slug, cat.slug));
    const id =
      existing[0]?.id ??
      (
        await db
          .insert(categories)
          .values({ slug: cat.slug, name: cat.name, description: cat.description, sortOrder: i })
          .returning()
      )[0]!.id;
    categoryId.set(cat.slug, id);
  }

  // Load all existing prompts once (answer -> {id, categoryId}) to avoid a query per prompt.
  const existingPrompts = await db
    .select({ id: prompts.id, answer: prompts.answer, categoryId: prompts.categoryId })
    .from(prompts);
  const byAnswer = new Map(existingPrompts.map((p) => [p.answer, p]));

  const writeAnswers = async (promptId: string, p: { answer: string; aliases?: string[] }) => {
    await db.delete(promptAnswers).where(eq(promptAnswers.promptId, promptId));
    await db.insert(promptAnswers).values({ promptId, text: p.answer, matchType: 'canonical' });
    for (const alias of p.aliases ?? []) {
      await db.insert(promptAnswers).values({ promptId, text: alias, matchType: 'alias' });
    }
  };

  let nNew = 0;
  for (const cat of SEED_CATEGORIES) {
    const cid = categoryId.get(cat.slug)!;
    for (const p of cat.prompts) {
      const existing = byAnswer.get(p.answer);
      if (existing) {
        if (existing.categoryId !== cid) {
          // Re-home to the current umbrella and refresh aliases/scores.
          await db
            .update(prompts)
            .set({ categoryId: cid, difficulty: p.difficulty, popularity: p.popularity })
            .where(eq(prompts.id, existing.id));
          await writeAnswers(existing.id, p);
        }
        continue;
      }
      const inserted = (
        await db
          .insert(prompts)
          .values({
            categoryId: cid,
            answer: p.answer,
            difficulty: p.difficulty,
            popularity: p.popularity,
            status: 'approved',
          })
          .returning()
      )[0]!;
      await writeAnswers(inserted.id, p);
      nNew++;
    }
  }

  // Reconcile active flags: only seeded umbrellas are dealt; old categories off.
  const activeSlugs = SEED_CATEGORIES.map((c) => c.slug);
  await db.update(categories).set({ isActive: true }).where(inArray(categories.slug, activeSlugs));
  await db
    .update(categories)
    .set({ isActive: false })
    .where(notInArray(categories.slug, activeSlugs));

  return { categories: SEED_CATEGORIES.length, newPrompts: nNew };
}
