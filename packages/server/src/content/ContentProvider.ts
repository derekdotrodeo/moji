/**
 * Loads approved prompt content into memory and deals balanced rounds.
 *
 * MVP strategy (design doc §6): load all approved prompts once at startup;
 * dealing is then a fast in-memory pick. Falls back to the bundled seed set if
 * the database is empty/unavailable so the game still runs locally.
 */
import { and, eq } from 'drizzle-orm';
import type { Pack } from '@moji/shared';
import type { Db } from '../db/client.js';
import { categories as categoriesTbl, promptAnswers, prompts } from '../db/schema.js';
import { SEED_CATEGORIES } from './seedData.js';

/** Display emoji per content pack (keyed by category slug). */
const PACK_EMOJI: Record<string, string> = {
  movies: '🎬',
  tv_shows: '📺',
  video_games: '🎮',
  famous_people: '🌟',
  music_artists: '🎤',
  books: '📚',
  historical_figures: '🗿',
  landmarks: '🏛️',
};

export interface PromptForPlay {
  id: string | null; // null when sourced from the bundled fallback
  answer: string;
  accepted: string[];
  blocklist: string[];
  difficulty: number;
}

export interface CategoryContent {
  slug: string;
  name: string;
  prompts: PromptForPlay[];
}

export interface DealtRound {
  category: { slug: string; name: string };
  /** one prompt per player, distinct, difficulty-mixed */
  assignments: PromptForPlay[];
}

export class ContentProvider {
  private byCategory = new Map<string, CategoryContent>();

  constructor(private readonly db: Db) {}

  async load(): Promise<void> {
    this.byCategory.clear();
    try {
      const cats = await this.db
        .select()
        .from(categoriesTbl)
        .where(eq(categoriesTbl.isActive, true));

      for (const cat of cats) {
        const rows = await this.db
          .select()
          .from(prompts)
          .where(and(eq(prompts.categoryId, cat.id), eq(prompts.status, 'approved')));

        const content: PromptForPlay[] = [];
        for (const p of rows) {
          const answers = await this.db
            .select()
            .from(promptAnswers)
            .where(eq(promptAnswers.promptId, p.id));
          content.push({
            id: p.id,
            answer: p.answer,
            accepted: answers.filter((a) => !a.isBlocklist).map((a) => a.text),
            blocklist: answers.filter((a) => a.isBlocklist).map((a) => a.text),
            difficulty: p.difficulty,
          });
        }
        if (content.length > 0) {
          this.byCategory.set(cat.slug, { slug: cat.slug, name: cat.name, prompts: content });
        }
      }
    } catch (err) {
      console.warn('[content] DB load failed, using bundled fallback:', (err as Error).message);
    }

    if (this.byCategory.size === 0) {
      console.warn('[content] No DB content found; using bundled seed set. Run `npm run db:seed`.');
      this.loadFallback();
    }
    console.log(`[content] loaded ${this.byCategory.size} categories.`);
  }

  private loadFallback(): void {
    for (const cat of SEED_CATEGORIES) {
      this.byCategory.set(cat.slug, {
        slug: cat.slug,
        name: cat.name,
        prompts: cat.prompts.map((p) => ({
          id: null,
          answer: p.answer,
          accepted: [p.answer, ...(p.aliases ?? [])],
          blocklist: [],
          difficulty: p.difficulty,
        })),
      });
    }
  }

  activeCategories(): { slug: string; name: string }[] {
    return [...this.byCategory.values()].map((c) => ({ slug: c.slug, name: c.name }));
  }

  /** Host-selectable content packs (one per active category for now). */
  packs(): Pack[] {
    return [...this.byCategory.values()].map((c) => ({
      slug: c.slug,
      name: c.name,
      emoji: PACK_EMOJI[c.slug] ?? '🎲',
    }));
  }

  /** Resolve a selected pack to the category slugs to deal from ('' = any). */
  categorySlugsForPack(packSlug: string): string[] {
    if (packSlug && this.byCategory.has(packSlug)) return [packSlug];
    return [];
  }

  /**
   * Deal a round: pick a category (from the allowed subset, else any), then
   * `count` distinct prompts, avoiding any in `usedPromptKeys`.
   */
  dealRound(
    allowedSlugs: string[],
    count: number,
    usedPromptKeys: Set<string>,
    pick: () => number, // injectable RNG in [0,1) — kept deterministic-friendly
  ): DealtRound | null {
    const pool = (allowedSlugs.length ? allowedSlugs : [...this.byCategory.keys()])
      .map((s) => this.byCategory.get(s))
      .filter((c): c is CategoryContent => !!c && c.prompts.length > 0);
    if (pool.length === 0) return null;

    const cat = pool[Math.floor(pick() * pool.length)]!;
    const available = cat.prompts.filter((p) => !usedPromptKeys.has(promptKey(p)));
    const source = available.length >= count ? available : cat.prompts;

    const shuffled = [...source].sort(() => pick() - 0.5);
    const assignments = shuffled.slice(0, count);
    return { category: { slug: cat.slug, name: cat.name }, assignments };
  }
}

export function promptKey(p: PromptForPlay): string {
  return p.id ?? `fallback:${p.answer}`;
}
