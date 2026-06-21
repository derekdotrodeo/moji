/**
 * Game content, derived from the curated prompt database
 * (./database/prompt-database.ts). The three UMBRELLAS become the selectable
 * lobby packs; each prompt's leaf category is metadata in the database and is
 * not needed for gameplay (dealing happens at the umbrella level).
 *
 * Used by db/seedDatabase.ts (insert/reconcile) and ContentProvider (in-memory
 * fallback — the game runs on this set even without a seeded database).
 */
import { PROMPT_DATABASE, type Umbrella } from './database/prompt-database.js';

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
  prompts: SeedPrompt[];
}

const UMBRELLAS: { slug: string; name: string; umbrella: Umbrella; description: string }[] = [
  { slug: 'screen', name: 'Screen', umbrella: 'Screen', description: 'Movies and TV shows.' },
  {
    slug: 'stories',
    name: 'Stories',
    umbrella: 'Stories',
    description: 'Novels, children’s books, theater, fairy tales, and nursery rhymes.',
  },
  {
    slug: 'pop_culture',
    name: 'Pop Culture',
    umbrella: 'Pop Culture',
    description: 'Disney and superheroes.',
  },
];

function buildCategories(): SeedCategory[] {
  return UMBRELLAS.map((u) => ({
    slug: u.slug,
    name: u.name,
    description: u.description,
    prompts: PROMPT_DATABASE.filter((e) => e.umbrella === u.umbrella).map((e) => ({
      answer: e.answer,
      difficulty: e.difficulty,
      popularity: e.recognition,
      ...(e.aliases.length ? { aliases: e.aliases } : {}),
    })),
  }));
}

export const SEED_CATEGORIES: SeedCategory[] = buildCategories();
