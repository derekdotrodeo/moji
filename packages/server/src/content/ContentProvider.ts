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
import { PACKS } from './database/prompt-database.js';
import { SEED_CATEGORIES } from './seedData.js';
import { soloPackSlugs } from './solo.js';

/**
 * Pack display metadata (emoji + lobby heading), keyed by slug. Lives in the
 * PACKS registry rather than the `categories` table so a rename or a regrouping
 * is a code edit, not a migration; the DB only supplies slug and name.
 */
const PACK_META = new Map(PACKS.map((p) => [p.slug, p]));

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

/** One player's prompt plus the pack it came from ('mixed' pack mode). */
export interface MixedAssignment {
  category: { slug: string; name: string };
  prompt: PromptForPlay;
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

  /**
   * Host-selectable content packs, in PACKS registry order so the lobby's
   * headings stay contiguous. A category with no registry entry (a stale row in
   * the DB) still ships, ungrouped, rather than vanishing from the picker.
   */
  packs(): Pack[] {
    const order = [...PACK_META.keys()];
    return [...this.byCategory.values()]
      .sort((a, b) => {
        const ai = order.indexOf(a.slug);
        const bi = order.indexOf(b.slug);
        return (ai < 0 ? order.length : ai) - (bi < 0 ? order.length : bi);
      })
      .map((c) => ({
        slug: c.slug,
        name: c.name,
        emoji: PACK_META.get(c.slug)?.emoji ?? '🎲',
        group: PACK_META.get(c.slug)?.group ?? 'More',
      }));
  }

  /** Resolve a selected pack to the category slugs to deal from ('' = any). */
  categorySlugsForPack(packSlug: string): string[] {
    if (packSlug && this.byCategory.has(packSlug)) return [packSlug];
    return [];
  }

  /**
   * Packs a solo game may deal from: the ones the bot has enough hand-written
   * clues for (content/solo.ts), narrowed to whatever actually loaded. A
   * `preferred` slug wins if it qualifies; otherwise the caller gets every
   * eligible pack and the dealer picks.
   */
  soloPackSlugs(preferred = ''): string[] {
    const eligible = soloPackSlugs().filter((slug) => this.byCategory.has(slug));
    if (preferred && eligible.includes(preferred)) return [preferred];
    return eligible;
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
    /**
     * Restricts what may be dealt at all (solo mode passes the bot's library).
     * Applied before the used-prompt filter, so an exhausted pack falls back
     * within the eligible set rather than escaping it.
     */
    eligible: (p: PromptForPlay) => boolean = () => true,
  ): DealtRound | null {
    const pool = (allowedSlugs.length ? allowedSlugs : [...this.byCategory.keys()])
      .map((s) => this.byCategory.get(s))
      .map((c) => (c ? { ...c, prompts: c.prompts.filter(eligible) } : c))
      .filter((c): c is CategoryContent => !!c && c.prompts.length > 0);
    if (pool.length === 0) return null;

    const cat = pool[Math.floor(pick() * pool.length)]!;
    const available = cat.prompts.filter((p) => !usedPromptKeys.has(promptKey(p)));
    const source = available.length >= count ? available : cat.prompts;

    const shuffled = [...source].sort(() => pick() - 0.5);
    const assignments = shuffled.slice(0, count);
    return { category: { slug: cat.slug, name: cat.name }, assignments };
  }

  /**
   * Deal a round where every player gets a prompt from a *different* pack.
   *
   * With more packs than players (17 vs a table of at most 8) each player lands
   * in a pack of their own. If a room ever outgrows the library the packs cycle
   * rather than failing — a repeated pack is a duller round, not a broken one.
   * Prompts are deduped by answer across the whole deal, since two players
   * cluing the same title is the one thing that actually breaks a round.
   */
  dealMixedRound(
    count: number,
    usedPromptKeys: Set<string>,
    pick: () => number,
  ): MixedAssignment[] | null {
    const pool = [...this.byCategory.values()].filter((c) => c.prompts.length > 0);
    if (pool.length === 0) return null;

    const shuffled = [...pool].sort(() => pick() - 0.5);
    const taken = new Set<string>();
    const takenAnswers = new Set<string>();
    const out: MixedAssignment[] = [];

    for (let i = 0; i < count; i++) {
      const cat = shuffled[i % shuffled.length]!;
      const available = cat.prompts.filter(
        (p) =>
          !taken.has(promptKey(p)) &&
          !takenAnswers.has(p.answer) &&
          !usedPromptKeys.has(promptKey(p)),
      );
      // Fall back within the pack before giving up, mirroring dealRound: a pack
      // exhausted by a long game should still deal something.
      const source = available.length
        ? available
        : cat.prompts.filter((p) => !taken.has(promptKey(p)) && !takenAnswers.has(p.answer));
      if (source.length === 0) continue;
      const prompt = source[Math.floor(pick() * source.length)]!;
      taken.add(promptKey(prompt));
      takenAnswers.add(prompt.answer);
      out.push({ category: { slug: cat.slug, name: cat.name }, prompt });
    }
    return out.length ? out : null;
  }

  /**
   * Draw one prompt from a category, excluding any key in `excludeKeys`.
   * Used for the per-player prompt reshuffle. Returns null if the category has
   * no unused prompts left.
   */
  drawOne(
    categorySlug: string,
    excludeKeys: Set<string>,
    pick: () => number,
    eligible: (p: PromptForPlay) => boolean = () => true,
  ): PromptForPlay | null {
    const cat = this.byCategory.get(categorySlug);
    if (!cat) return null;
    const available = cat.prompts.filter((p) => eligible(p) && !excludeKeys.has(promptKey(p)));
    if (available.length === 0) return null;
    return available[Math.floor(pick() * available.length)]!;
  }
}

export function promptKey(p: PromptForPlay): string {
  return p.id ?? `fallback:${p.answer}`;
}
