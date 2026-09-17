/**
 * Which packs solo mode can deal from.
 *
 * Solo mode is symmetrical: the bot has to author a clue for whatever it is
 * dealt, and it has to recognise whatever the human was dealt, and both come
 * from the same hand-written library. So a pack is solo-eligible only when
 * enough of its prompts are clued — using the same ≥24 floor
 * (`content/packs.test.ts`) the party packs are held to, for the same reason:
 * a full table over three rounds must not run out of distinct prompts.
 */
import { BOT_CLUE_ANSWERS } from './database/bot-clues.js';
import { SEED_CATEGORIES } from './seedData.js';

/** 8 players × 3 rounds — the largest game we expect to deal without repeats. */
export const SOLO_MIN_CLUED_PROMPTS = 24;

/** Pack slug -> the answers in it the bot has clues for. */
export function cluedAnswersByPack(): Map<string, Set<string>> {
  const out = new Map<string, Set<string>>();
  for (const pack of SEED_CATEGORIES) {
    const clued = pack.prompts.filter((p) => BOT_CLUE_ANSWERS.has(p.answer)).map((p) => p.answer);
    if (clued.length > 0) out.set(pack.slug, new Set(clued));
  }
  return out;
}

/** Packs a solo game may be dealt from, in registry order. */
export function soloPackSlugs(): string[] {
  return [...cluedAnswersByPack()]
    .filter(([, answers]) => answers.size >= SOLO_MIN_CLUED_PROMPTS)
    .map(([slug]) => slug);
}

/** Is this pack playable in solo mode? */
export function isSoloPack(slug: string): boolean {
  return soloPackSlugs().includes(slug);
}

/**
 * Can the bot play this prompt? Solo rounds deal only these: the bot needs a
 * clue to author for its own prompt, and it needs the human's prompt in its
 * retrieval index to stand any chance of guessing their clue.
 */
export function isBotPlayable(prompt: { answer: string }): boolean {
  return BOT_CLUE_ANSWERS.has(prompt.answer);
}
