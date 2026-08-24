# Moji content guidelines

How Moji's prompts are stored, and — more importantly — what makes a prompt worth adding.

## Where content lives

`packages/server/src/content/database/prompt-database.ts` is the **source of truth**: one curated
array (`PROMPT_DATABASE`, ~923 entries) that everything else derives from.

- `content/seedData.ts` groups it into the selectable lobby packs.
- `db/seedDatabase.ts` inserts/reconciles it into Postgres (`npm run db:seed`).
- `content/ContentProvider.ts` loads approved prompts into memory at startup and deals rounds from
  there — falling back to the bundled seed set when the database is empty or unavailable, **so the
  game runs off this file even with no seeded database.**

Add or edit content by editing the database file and re-seeding. Never hand-write SQL for it.

### Entry shape

| Field | Meaning |
|---|---|
| `answer` | The canonical answer text. |
| `aliases` | Accepted alternates — short forms, alt spellings, US/UK titles. These become accepted guesses (`game/guessMatching.ts` matches the whole answer or a curated alias). |
| `umbrella` | `Screen` \| `Stories` \| `Pop Culture` — the **selectable lobby pack**. Dealing happens at this level. |
| `category` | The leaf ("Animated TV", "Fairy Tales", "Disney"). Metadata for curation only; unused in gameplay. |
| `difficulty` | 1–5. |
| `recognition` | 1–10 — will the room know it? |
| `emoji` | 1–10 — can it be built from emoji at all? |
| `multiPath` | 1–10 — are there several *different* ways to clue it? |
| `total` | Sum of the three 1–10 scores. The array is sorted by `total` desc, tie-broken by `recognition`. |

Current umbrellas: **Screen** (movies + TV), **Stories** (novels, children's books, theater, fairy
tales, nursery rhymes), **Pop Culture** (Disney + superheroes).

## What makes a good prompt

A good prompt sits in the band between *"nobody knows it"* and *"there is one obvious emoji for it."*
Both edges ruin the round, in opposite ways.

**Knowable.** The answer should be general knowledge, or gettable from context once a few emoji
land. A prompt only a superfan recognizes kills the round for everyone else. That's `recognition`.

**Not too obvious.** The prompt must not map one-to-one onto a literal emoji. If a single emoji
*is* the answer, there's no cluing craft, no race, and nothing for the author to think about.

**Multi-path.** The best prompts can be clued several ways — plot, title pun, character, imagery —
so two authors given the same prompt produce visibly different clues. That's `multiPath`.

**Expressible.** It still has to be buildable from the emoji set. That's `emoji`.

### Rejecting whole categories: the FOOD example

**FOOD is excluded as a category**, and the reason generalizes. Too many foods have a literal emoji
— 🍕 🌮 🍔 🍎 — so the clue collapses into "type the answer as a picture," which is no fun to author
and no fun to guess.

When a large fraction of a category's members fail the not-too-obvious test, reject the *category*
rather than filtering entry by entry. It's cheaper, and it keeps the pack's character consistent.

### Checklist for new content

1. Score the candidate on all four axes before adding it.
2. Drop anything whose answer is essentially a single emoji.
3. Add aliases for every form a player might reasonably type.
4. For a proposed new category or umbrella, sample it first — if literal-emoji answers are common
   inside the sample, reject the category.
5. Keep the array sorted by `total` desc, then `recognition` desc.
