# Moji — case study brief

A briefing document for an agent writing a portfolio case study. Everything below was verified
against the repo at `a9cad06`..HEAD (main), 2026-09-17.

## 1. What the project is

**Moji** is a real-time multiplayer browser party game. Each player is dealt a secret prompt (a
movie, book, song, game…), builds a clue out of 1–10 emoji, and then the room plays the clues back
one at a time while everyone races to guess. No app, no signup — a host creates a room and shares a
5-character code or a `/r/CODE` link.

One-line pitch already in the product copy: *"Explain a movie in ten emoji. Your friends get thirty
seconds."*

**Status:** working, playtested (August 2026), not publicly launched. Solo project. Repo is
private/UNLICENSED.

## 2. Verifiable facts and numbers

Use these; they are all checked. Do not invent others.

| Thing | Value |
|---|---|
| Timeline | First commit 2026-06-20, solo mode 2026-09-17 |
| Code size | ~11,100 lines of TS/TSX/MD, of which 1,366 is the curated prompt data file |
| Workspaces | 3 — `@moji/shared`, `@moji/server`, `@moji/client` (npm workspaces monorepo) |
| Tests | 193 tests, 14 files, all passing, full suite in ~0.7s (Vitest) |
| Prompt library | 1,145 curated prompts, 30 leaf categories, 329 aliases on 241 entries |
| Bot clue library | 102 answers, 204 hand-written clues, across 3 solo-eligible packs |
| Packs | 17 selectable packs under 4 lobby umbrellas (Screen 492 / Pop Culture 322 / Stories 243 / Video Games 88 prompts) |
| Game state machine | 10 phases, LOBBY → … → ROOM_CLOSED |
| Socket contract | 12 client→server commands, 6 server→client pushes, all typed end-to-end |
| Emoji picker | emojibase-data (~1,900 emoji), lazy-loaded, filtered through the game's own validation rules |
| Session length | ~35s per player per round; an 8-player, 3-round game runs ~18 minutes |
| Deploy | Single multi-stage Docker image (server serves the built client) behind a Cloudflare Tunnel |

**Stack:** React 18 + TypeScript + Vite + Tailwind (client) · Node 20 + Express + Socket.IO +
TypeScript (server) · PostgreSQL via Drizzle ORM · Vitest · Docker Compose.

## 3. The architecture story (the strongest technical material)

Four decisions carry the case study. Each has a real failure it prevents — lead with the failure,
not the pattern name.

### 3.1 A role-filtered serializer as the anti-cheat backbone

`packages/server/src/realtime/serialize.ts` (97 lines) is a pure function from a room snapshot + a
recipient ID to that recipient's view. Secret data isn't hidden in the UI — it is **physically
absent from the payload**. Open devtools mid-round and the answer is not there to find.

The elegant part: entitlement to the answer is one predicate (`canSeeAnswer` — you authored it, you
already solved it, or the clue has resolved), and *three different features* are derived from it:
the answer text, the solvers' back-channel chat, and the "bump" (applaud) button. The comment in the
file states the rule as: *"If you add a way to see chat, you are adding a way to see the answer."*
Chat is fanned out **per-socket**, never room-broadcast, because it's unfiltered player writing that
routinely names the answer.

22 of the 160 tests target this one file, with names that read like a threat model: *"never includes
another player's prompt anywhere in the payload"*, *"travels with the answer, never apart from it"*,
*"does not offer a spectator a button the server would refuse"*.

### 3.2 Scoring as a pure, config-driven incentive design

`packages/shared/src/scoring.ts` — 96 lines, zero dependencies, no game state. The state machine
hard-codes no constants.

- **Guessers:** linear decay, 1000 points for an instant correct guess down to 150 at the buzzer.
- **Authors:** time-weighted *per solver* — each solve pays `100 + 150 × (how long it took /
  window)`, summed across everyone who got it.

This is the best "product thinking in code" anecdote in the repo. The author rate was originally
flat (130 per solver). Under a flat rate, **the most literal clue you can possibly build (🦁👑 for
*The Lion King*) is strictly optimal** — which is the exact "type the answer as a picture" failure
the content guidelines reject whole categories for. Time-weighting adds a second dial: the author
wants everyone to get there, but *not instantly*. And it's deliberately monotonic in both solvers and
time, so a solve never costs you anything — which is what an earlier "Goldilocks" curve got wrong by
zeroing out clues after players had done the work.

Paid prompt swaps (150 points, 3 per round) are the same idea from the other side: free rerolls let
a player fish for whichever prompt is easiest to clue literally. The charge is deliberately *not*
floored at zero, because a floor would make the first swap of a game free — and that's exactly the
swap worth taxing.

The test names are quotable: *"a five-person instant solve loses to a four-person slow one"*,
*"never pays less than the base, so a solve is never a penalty"*.

### 3.3 Progressive letter hints, planned server-side

`packages/shared/src/hints.ts` plans which letters drop when (scattered, not left-to-right, so the
*shape* arrives before the spelling); `Room` ticks the schedule and pushes only the mask as it
currently stands. The plan and the answer never leave the server, and the reveal count is floored so
the mask can never become the whole answer.

The tuning story: the reveal fraction started at **0.75** and short answers were gutted — *Jaws*
finished the window as `J_ws`, *The Lion King* showed 8 of 11 letters, and the back half of every
clue turned into hangman with nobody looking at the emoji at all. It's now **0.4**: a 4-letter
answer drops exactly one letter, an 11-letter one drops four. Enough to break a stall, not enough to
replace the puzzle.

### 3.4 The solo bot is on the wrong side of the anti-cheat boundary

This is the newest piece and probably the best one to lead the technical half with, because it is
the only part a reader can *play* (see §5.3) and because it closes the loop on §3.1 and §3.2 at
once.

Solo mode puts one bot in the room. The bot is a **headless client**: `RoomManager` hands it the
output of `serializeRoomFor(snapshot, botId)` — byte for byte what a browser on the other side of
the room receives — and it acts only by calling the same guarded `Room` commands a socket handler
calls. It is rate-limited, validated and rejected exactly like a human. The framing that makes it
worth writing about:

> The AI opponent is proof the anti-cheat boundary is real, because the opponent is on the wrong
> side of it.

It therefore cannot read the answer to your clue — the serializer doesn't put it in its payload — so
it has to actually guess. It does that with small-scale TF-IDF retrieval: each answer in its clue
library is a document (its emoji), your clue is the query, each emoji is weighted by how rare it is
across the library (🦣 tells it far more than 😂), and candidates are ranked by cosine similarity,
scoped to the clue's pack. The pack label being public is what makes this tractable — it narrows the
bot's search exactly as it narrows a human's.

**The part worth explaining slowly: confidence sets the bot's solve *time*, not just its answer.**
Author points are `100 + 150 × (how long the solve took / window)`, so a clue cracked instantly pays
its author almost nothing and one that takes the full window pays nearly double. Mapping confidence
onto timing therefore makes the bot *enforce* the curve from §3.2: a literal clue scores a high
cosine, gets guessed early, and earns you little; an oblique one has the bot circling, throwing
wrong guesses into the public feed, and landing late — which pays. A bot that simply knew the answer
and waited a random interval would produce identical-looking gameplay and mean nothing.

It fails honestly, which is the other reason it's good material. Verified in a real game: given the
deliberately meaningless clue 🎬🍿❓ for *The Polar Express*, it guessed "The Super Mario Bros.
Movie" and "The Spongebob Squarepants Movie" — plausible neighbours from the same pack — and ran out
of clock. Given the canonical 🦁👑🌅 it solves in about five seconds and the author earns ~127 of a
possible 250.

Cost and constraints, stated honestly: the bot needs a hand-written clue for its own prompt (a bot
that built clues from the words in its prompt would produce exactly the literal clue the game
punishes), so solo ships 204 hand-authored clues over 102 answers and deals only prompts that
library covers — reusing the same ≥24-per-pack floor the party packs are held to. Expanding solo is
an authoring job, not a flag.

One detail that belongs in the "judgment" column: bot solves are excluded from `cluesGuessed`, the
counter behind the public landing-page number (§5.2). A bot padding a public stat would make it
exactly the fiction that counter was written to replace.

### 3.5 Seams instead of premature infrastructure

Live room state is in-process memory behind a `RoomStore` interface (39 lines) explicitly so it can
become Redis-backed later without touching the state machine. Same pattern for `Broadcaster` (how
messages ship) and `ContentProvider` (where prompts come from). Postgres is touched only for content
and a fire-and-forget record when a game completes — **live play never hits the database**, so a DB
outage degrades rather than breaks.

Supporting details worth a sentence each: HMAC-signed stateless reconnection tokens (no DB lookup),
a 60-second disconnect grace window before a dropped player loses their slot, automatic host
migration to the longest-connected player, and room codes in a Crockford-ish base32 alphabet with no
ambiguous characters (no O/0, I/1, L, U).

## 4. The content-design story (the differentiator)

Most multiplayer-game case studies stop at sockets. This one has a **curation methodology**, and
it's what makes the project read as a game designer's work rather than a plumbing exercise.
`docs/content-guidelines.md` is the source.

Every prompt is scored on four axes: `recognition` (will the room know it?), `emoji` (can it be
built at all?), `multiPath` (are there *several different* ways to clue it?), and `difficulty`. A
good prompt lives in the band between "nobody knows it" and "there is one obvious emoji for it."

**The FOOD rule** is the best single anecdote. Food is excluded as a category entirely — too many
foods have a literal emoji (🍕 🌮 🍔 🍎), so the clue collapses into "type the answer as a picture."
The generalized rule: when a large fraction of a category fails the not-too-obvious test, **reject
the category, not the entries**. This was later applied to reject **Bands**: band names split into
the trivially literal (Guns N' Roses 🔫🌹, Red Hot Chili Peppers 🌶️, Queen 👑) and bare proper nouns
with no imagery at all — both halves fail, in opposite directions. Songs survived the same test
because a song title is a *phrase*, but the curation still had to steer away from titles that are
their own emoji (Umbrella, Firework, Yellow Submarine, Purple Rain).

**"A pack is a hint, not a boundary."** The pack name is on screen while people race, so it's the
one free hint every guesser gets, and its only job is to narrow scope. The library was restructured
from 4 broad umbrellas to 17 narrow packs because "Stories" spanning nursery rhymes to *Crime and
Punishment* narrowed nothing. Overlap between packs is explicitly *fine* — *Twister* is a disaster
film and a party game — and the guidelines tell future contributors not to add rules keeping packs
disjoint. The one thing that actually breaks a round is the same answer being dealt twice within it,
so the seeder dedupes by answer and a test asserts it.

**Constraints encoded as tests.** `packs.test.ts` fails if any pack drops below 24 prompts (8
players × 3 rounds), if a leaf category ends up in no pack (silently undealable), or if a pack can
deal a duplicate answer. When the threshold trips, the documented fix is *content, not a lower
threshold*. The thinnest pack today is Stage & Musicals at 26.

## 5. Three product details worth a short section each

**5.1 Link previews as the entire growth surface.** The game spreads exactly one way: someone pastes a
room link into a group chat. So the server rewrites the HTML shell per-request — `/r/:code` stamps
live Open Graph tags with the **current player count** ("4 players waiting.") into the card,
`Cache-Control: no-store` because a CDN holding that count for a room that ended an hour ago is
worse than no card at all. The room-card description and the search-engine description are
deliberately different strings doing different jobs. The room code from the URL is filtered down to
the code alphabet before being echoed into HTML, not merely escaped.

**5.2 Refusing to fake a number.** The landing page's social-proof slot previously held a hardcoded
`128,402 clues guessed this week`. It now reads a real count from `GET /api/stats`. Every field is
nullable, the query never throws, and the component renders **nothing** on a null, a failure, *or* a
zero — a quiet week shows no line rather than "0 clues guessed." The stated reason, in the code
comment: *"a fake number on a public site is the kind of detail that turns a launch thread into a
thread about the author."* It shows the all-time total rather than the weekly one, with a note to
switch the field and the copy together when the weekly number stops embarrassing itself.

**5.3 A party game has to be playable by one person.** The failure mode of a multiplayer game in a
portfolio is that nobody can try it: a reader who clicks through has no room, no code and nobody to
play with. Solo mode (§3.4) is the answer — `/solo` deals a game against the bot on load, no lobby,
no signup, two rounds, about four minutes end to end. Worth noting *why* it cost so little to build:
`MIN_PLAYERS` was already 2, `start()` only checks the host and the player count, and every
broadcast path keys off a `playerId → socketId` map that a socketless player simply falls out of. A
bot was a legal player before anyone wrote one.

## 6. Craft signals for the "how I work" angle

- **The codebase teaches.** Comments explain *why*, including what was tried and abandoned. The
  `CLAUDE.md` file is a written record of design invariants ("break these only on purpose") kept so
  any machine or session starts with the same context.
- **Tests as specifications.** `it('a five-person instant solve loses to a four-person slow one')`
  documents a design intent, not an implementation.
- **Playtest instrumentation shipped.** `LOG_GUESS_MISSES` logs every incorrect guess next to the
  real answer, explicitly as tuning data for the fuzzy matcher (normalize → drop articles →
  Levenshtein with a length-scaled tolerance: short answers must be exact, only long titles allow
  two typos). It's typo forgiveness, not partial credit — "mario" never matches "super mario bros".
- **Validation lives once, in shared.** `emoji-rules.ts` runs in the client for instant feedback and
  on the server as the authoritative backstop — and the emoji *picker* is built by filtering the
  whole emojibase set through that same validator, so disallowed emoji can't be offered in the first
  place.
- **The design language has a name.** "Retro Internet Party" — Y2K sticker aesthetic, chunky
  outlines, hard offset shadows, acid/neon on dark grape-ink. Tokenized in `tailwind.config.ts`.
  Entry animations use scale only, never opacity, per the design handoff.

## 7. Suggested case-study shape

1. **Hook** — the 🦁👑 problem: a game where the most obvious clue must be the *losing* one, and how
   you make scoring enforce that.
2. **Play it** — put the `/solo` link high, not at the bottom. The strongest thing this project can
   do on a portfolio page is be played for four minutes by someone who came to read.
3. **What it is** — 3–4 sentences + a screenshot or short GIF of the Guess screen (clue tiles,
   filling letter blanks, live feed).
4. **Server-authoritative by construction** — §3.1, with the "answer is absent from the payload"
   framing and one test-name pull-quote.
5. **Designing the incentive** — §3.2, flat rate → time-weighted, plus paid swaps and the un-floored
   charge.
6. **An opponent that can't cheat** — §3.4. Lands hardest straight after §3.1 and §3.2, because it
   depends on both: the bot is bounded by the serializer and it enforces the author curve. Include
   the 🎬🍿❓ failure and the 🦁👑🌅 five-second solve as a matched pair.
7. **Tuning by playtest** — §3.3 hints at 0.75 → 0.4; also the 3-round default and the shift to 17
   narrow packs.
8. **Content as engineering** — §4, the FOOD rule, the Bands rejection, constraints encoded as
   tests, and the bot clue library as content with a functional job (§3.4).
9. **Shipping details** — §5, link previews, the refusal to fake a number, solo as the answer to
   "nobody can try a multiplayer game".
10. **What's next** — §8 below.

Visual assets to request/capture: the Create screen (prompt + emoji builder tray), the Guess screen
mid-round, the Reveal screen (answer + solve times + author points), and a room-link card as it
renders in a chat client. For §3.4, the single best asset is a capture of the guess feed while the
bot is wrong — its near-miss guesses next to the filling letter blanks show the mechanism better
than prose does.

## 8. Known open work (good "what's next" material, all honest)

- **Blitz mode** — play every clue in one shared window instead of serially, to cut the ~18-minute
  8-player game down. Designed, not built.
- **Same-prompt voting round** — the whole room clues one prompt and votes on the best clue.
  Designed, not built.
- **A prompt can only live in one pack.** `prompts.categoryId` is a single FK. Four real cases were
  dropped on this (*Twister*, *Bohemian Rhapsody*, *My Little Pony*, *Care Bears*). Fix is a
  `prompt_categories` join table; deliberately deferred.
- **Solo covers 3 packs of 17.** Disney, Fairy Tales & Rhymes and Children's Movies have clue
  libraries; the other fourteen don't, and each needs ~24+ hand-written clues to become
  solo-eligible. The gate is authoring effort, and the test suite refuses a half-covered pack.
- **The bot only plays one skill level.** Its tuning (`DEFAULT_BOT_TUNING`) is a single set of
  constants; difficulty would be a matter of exposing them, not new machinery.
- **Mixed pack mode is built** (every player draws from a different pack — 3 rounds × 4 players
  touches 12 packs instead of 3). It solves *variety*; Blitz solves *pacing*; the two compose.

## 9. Guardrails — do not claim

- **No usage, traffic, or user numbers.** The project has one recorded playtest and no public
  launch. Given the project's own stance on fake numbers (§5), inventing "10,000 games played" would
  be an unusually bad look. If a metric is needed, use the code/content numbers in §2.
- **Not a team project, no client.** Solo work; the design language came from a design handoff
  document.
- **Don't call the persistence layer "scalable" or claim Redis/horizontal scaling.** It's in-memory
  with a documented seam for later. That's the honest and more impressive framing.
- **Don't quote the prompt total as a round number.** It's 1,145 (the content doc says "~1150").
- **Do not call the bot an LLM, "AI-powered", or machine learning.** It is TF-IDF cosine similarity
  over a hand-authored corpus of ~200 emoji clues, with a timing model on top. No model, no API
  call, no training. Saying so plainly is more impressive than the alternative to anyone qualified
  to hire for this, and calling it AI invites exactly the question it fails.
- **Don't claim the bot is unbeatable or especially strong.** It loses often, and losing honestly is
  the designed behaviour. Its skill is a set of constants, not a result.
- Two small doc drifts if precision matters: `docs/content-guidelines.md` says "15" packs where the
  code has 17, and `README.md` links a design doc (`i-want-to-build-dazzling-lemon.md`) that isn't in
  the repo — both are known and noted in `CLAUDE.md`.
