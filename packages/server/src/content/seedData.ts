/**
 * Game content, derived from the curated prompt database
 * (./database/prompt-database.ts). Its PACKS registry defines the selectable
 * lobby packs; each pack collects one or more leaf `category` values, and a
 * round is dealt from exactly one pack.
 *
 * Packs are hints, not a partition: a leaf may feed several packs, so the same
 * title can legitimately be reachable under more than one label. What must never
 * happen is the same answer landing twice in one pack — that lets a single round
 * deal it to two players. Deduped by answer here so overlap is safe to add.
 *
 * Used by db/seedDatabase.ts (insert/reconcile) and ContentProvider (in-memory
 * fallback — the game runs on this set even without a seeded database).
 */
import {
  PACKS,
  PROMPT_DATABASE,
  type PromptEntry,
  type Umbrella,
} from './database/prompt-database.js';

export interface SeedPrompt {
  answer: string;
  difficulty: number; // 1..5
  popularity: number; // 1..10 (recognition score from the database)
  aliases?: string[];
}

export interface SeedCategory {
  slug: string;
  name: string;
  description?: string;
  /** lobby heading this pack sits under */
  group: Umbrella;
  emoji: string;
  prompts: SeedPrompt[];
}

/** First entry wins — the array is quality-sorted, so that's the better one. */
function dedupeByAnswer(entries: PromptEntry[]): PromptEntry[] {
  const seen = new Set<string>();
  return entries.filter((e) => !seen.has(e.answer) && (seen.add(e.answer), true));
}

function buildCategories(): SeedCategory[] {
  return PACKS.map((pack) => {
    const leaves = new Set(pack.categories);
    return {
      slug: pack.slug,
      name: pack.name,
      description: pack.description,
      group: pack.group,
      emoji: pack.emoji,
      prompts: dedupeByAnswer(PROMPT_DATABASE.filter((e) => leaves.has(e.category))).map((e) => ({
        answer: e.answer,
        difficulty: e.difficulty,
        popularity: e.recognition,
        ...(e.aliases.length ? { aliases: e.aliases } : {}),
      })),
    };
  });
}

export const SEED_CATEGORIES: SeedCategory[] = buildCategories();
