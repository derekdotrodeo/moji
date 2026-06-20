/**
 * Emoji picker dataset, sourced from the well-maintained `emojibase-data` set
 * (1900+ emoji with labels + search tags). We:
 *   - map emojibase group numbers to the design's category tabs,
 *   - filter every emoji through our own `validateClue` so the disallowed
 *     letter/number/keycap emoji are excluded automatically (flags kept),
 *   - build a keyword search index from each emoji's label + tags + shortcodes.
 *
 * The dataset is lazy-loaded (dynamic import) so it doesn't bloat the initial
 * bundle — only players who reach the Create screen download it.
 */
import { validateClue } from '@moji/shared';

export type EmojiCat =
  | 'Smileys'
  | 'People'
  | 'Animals'
  | 'Food'
  | 'Activity'
  | 'Travel'
  | 'Objects'
  | 'Symbols'
  | 'Flags';

export const EMOJI_CATS: EmojiCat[] = [
  'Smileys',
  'People',
  'Animals',
  'Food',
  'Activity',
  'Travel',
  'Objects',
  'Symbols',
  'Flags',
];

// emojibase `group` number -> design tab (group 2 = component/skin-tones, skipped).
const GROUP_TO_CAT: Record<number, EmojiCat> = {
  0: 'Smileys',
  1: 'People',
  3: 'Animals',
  4: 'Food',
  5: 'Travel',
  6: 'Activity',
  7: 'Objects',
  8: 'Symbols',
  9: 'Flags',
};

interface RawEmoji {
  emoji: string;
  label?: string;
  group?: number;
  tags?: string[];
  shortcodes?: string[];
}

interface IndexedEmoji {
  e: string;
  cat: EmojiCat;
  kw: string[];
}

export interface EmojiData {
  byCat: Record<EmojiCat, string[]>;
  /** keyword search across all categories (matches label/tags/shortcodes) */
  search(query: string): string[];
}

let cache: Promise<EmojiData> | null = null;

export function loadEmojiData(): Promise<EmojiData> {
  if (!cache) cache = build();
  return cache;
}

async function build(): Promise<EmojiData> {
  const mod = (await import('emojibase-data/en/data.json')) as unknown as { default: RawEmoji[] };
  const raw = mod.default;

  const indexed: IndexedEmoji[] = [];
  for (const r of raw) {
    const cat = r.group !== undefined ? GROUP_TO_CAT[r.group] : undefined;
    if (!cat) continue;
    // Reuse the authoritative clue rules to drop letters/numbers/keycaps.
    if (!validateClue([r.emoji], { promptHasNumber: false }).ok) continue;

    const kw = new Set<string>();
    for (const word of (r.label ?? '').toLowerCase().split(/[^a-z0-9]+/)) {
      if (word) kw.add(word);
    }
    for (const t of r.tags ?? []) kw.add(t.toLowerCase());
    for (const sc of r.shortcodes ?? []) kw.add(sc.replace(/[^a-z0-9]/gi, '').toLowerCase());
    indexed.push({ e: r.emoji, cat, kw: [...kw] });
  }

  const byCat = Object.fromEntries(EMOJI_CATS.map((c) => [c, [] as string[]])) as Record<
    EmojiCat,
    string[]
  >;
  for (const x of indexed) byCat[x.cat].push(x.e);

  const search = (query: string): string[] => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    const out: string[] = [];
    for (const x of indexed) {
      if (x.e === q || x.kw.some((k) => k.includes(q))) {
        out.push(x.e);
        if (out.length >= 120) break;
      }
    }
    return out;
  };

  return { byCat, search };
}
