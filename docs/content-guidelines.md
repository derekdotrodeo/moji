# Moji content guidelines

How Moji's prompts are stored, and — more importantly — what makes a prompt worth adding.

## Where content lives

`packages/server/src/content/database/prompt-database.ts` is the **source of truth**: one curated
array (`PROMPT_DATABASE`, ~1150 entries) that everything else derives from.

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
| `category` | The leaf ("Animated TV", "Fairy Tales", "Disney"). **Rounds are dealt at this level**, and the pack name is shown to guessers. |
| `umbrella` | `Screen` \| `Stories` \| `Pop Culture` \| `Video Games` — the family the leaf belongs to. Display grouping only: the lobby heading its pack pill sits under. |
| `difficulty` | 1–5. |
| `recognition` | 1–10 — will the room know it? |
| `emoji` | 1–10 — can it be built from emoji at all? |
| `multiPath` | 1–10 — are there several *different* ways to clue it? |
| `total` | Sum of the three 1–10 scores. The array is sorted by `total` desc, tie-broken by `recognition`. |

### Packs

`PACKS` in the database file is the registry of **selectable lobby packs** — 17 of them, grouped
under the four umbrellas. Each pack names the leaf `category` values it deals from. Most are one
leaf; two merge several, both deliberately:

- **Songs** and **Toys & Board Games** broaden Pop Culture past Disney + superheroes. **Bands** was
  sampled and rejected on the FOOD rule: band names split into the trivially literal (Guns N' Roses
  🔫🌹, Red Hot Chili Peppers 🌶️, Queen 👑) and bare proper nouns with no imagery. Songs avoid this
  because a title is a phrase — but curate away from the ones that *are* their own emoji (Umbrella,
  Firework, Yellow Submarine, Purple Rain).
- **Fairy Tales & Rhymes** = Fairy Tales + Nursery Rhymes. The pre-literacy oral canon reads as one
  thing to a player, and neither leaf (39, 35) is comfortably big enough to deal a game alone.
- **Video Games** = all 13 game leaves. Each holds 2–12 entries — far too few to deal a round — and
  the boundaries (Nintendo vs Platformers vs Action Adventure) are curator distinctions a guesser
  can't use anyway.

Adding a pack is one edit: an entry in `PACKS`. `seedData.ts`, the seeder, `ContentProvider`, and
the lobby all derive from it, and `content/packs.test.ts` fails if a leaf ends up in no pack (making
it silently undealable). Overlap is not an error — see below. Renames and regroupings are code edits,
not migrations — the `categories` table stores only slug and name, and the seeder re-homes moved
prompts on the next run.

### A pack is a hint, not a boundary

The pack name is on screen while people race (`activeClue.category`, on the Guess screen — per-clue,
never `view.category`, which is null in `mixed` pack mode), so it is the one hint every guesser gets
for free. Its job is to **narrow scope**, and that is the whole of its job.

**Narrow beats tidy.** "Stories" spanning nursery rhymes to *Crime and Punishment* gave a guesser
nothing to work with. That's why the leaves were promoted.

**Overlap is fine.** A pack is not a partition of the database. *Twister* is a disaster movie and a
party game; *Bohemian Rhapsody* is a song and a biopic; *My Little Pony* is a cartoon and a toy
aisle. A title being reachable under two labels costs nothing — it just means two different hints
can lead to it. Don't add rules to keep packs disjoint, and don't reject a good prompt because a
neighbouring pack could also claim it.

**The one real failure is a repeat inside a round.** If a single pack can deal the same answer to
two players in one round, two people are cluing the same thing and the round is broken. That's the
invariant worth protecting, and it's cheap: `seedData.ts` dedupes each pack by answer, and
`content/packs.test.ts` asserts no pack contains a duplicate.

Note the current limit: `prompts.categoryId` is a single FK and the seeder keys prompts by `answer`,
so **one entry can only live in one pack today**. The registry already supports a leaf feeding
several packs; per-title membership needs a `prompt_categories` join table.

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

Aliases only need forms that survive `normalize()` in `game/guessMatching.ts` — it lowercases,
strips diacritics, drops articles (`the/a/an/of/and`), and turns punctuation into spaces, then
allows a length-scaled edit distance. "Pacman" for "Pac-Man" is wasted; "GTA" and "FNAF" are not.

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
5. Skip franchise entries whose obvious guess is the parent title. "Breath of the Wild" marks a
   player typing "Zelda" wrong, which punishes the room for knowing the answer.
6. One entry per *answer string* — not because overlap is bad (it isn't), but because the seeder
   keys prompt identity by `answer`. A title that belongs in two packs stays where it is until the
   join table lands.
7. A new leaf category needs a `PACKS` entry (its own pack, or added to an existing one's
   `categories`), or it will never be dealt. The test catches this.
8. Keep the array sorted by `total` desc, then `recognition` desc.
