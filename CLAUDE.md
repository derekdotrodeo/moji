# Working on Moji

Moji is a real-time multiplayer party game: each player gets a secret prompt, builds an emoji
clue for it, and everyone races to guess each other's clues. Setup, scripts, and stack live in
`README.md` — this file records the things that aren't obvious from reading the code, so any
machine (or any session) starts with the same context.

## Design invariants

Break these only on purpose.

- **The server is authoritative.** Everything sent to clients goes through the role-filtered
  serializer in `packages/server/src/realtime/serialize.ts`, so a clue's answer is physically
  absent from the payload of anyone not entitled to it — that is the author, anyone who has
  already solved it, and everyone once the clue resolves. Any new field on a clue/room needs a
  decision in that file.
- **Live room state is in memory, behind a seam.** `packages/server/src/rooms/RoomStore.ts` exists
  so state can move to Redis later without touching the state machine. Keep room mutation behind it.
- **Scoring is pure and config-driven.** `packages/shared/src/scoring.ts` — the state machine
  hard-codes no constants. Guesser points decay linearly 1000 → 150 across the guess window.
  **Author points are time-weighted per solver:** each solve pays `100 + 150 × (howLongItTook /
  window)`, summed. Both dials matter — the author wants everyone to get there, but not instantly.
  This replaced a flat 130-per-solver rate, under which the most literal clue you could build
  (🦁👑) was strictly optimal — the same "type the answer as a picture" failure that
  `docs/content-guidelines.md` rejects whole categories for. It is deliberately monotonic in *both*
  solvers and time, so a solve never costs you anything; that is what the older "Goldilocks" curve
  got wrong when it zeroed out clues after players had done the work.
- **Prompt swaps cost score** (`RoomConfig.reshuffleCost`, default 150, charged in
  `Room.reshufflePrompt`). Free swaps let a player fish for the prompt that is easiest to clue
  literally, which pulls against the author curve above. The charge is *not* floored at zero — a
  floor would make the first swap of a game free, and that is exactly the swap worth taxing.
- **Emoji validation runs on both sides.** `packages/shared/src/emoji-rules.ts` is enforced in the
  client for instant feedback *and* on the server as the authoritative backstop against pasted or
  tampered input. 1–10 emoji; no number emoji when the answer contains a digit; no spelling out
  the answer.
- **Letter hints are computed server-side and pushed one step at a time.**
  `shared/hints.ts` plans which letters drop when; `Room` ticks the schedule and emits `clue:hint`
  with the mask as it currently stands. The plan and the answer never leave the server, and the
  reveal fraction is floored so the mask can never become the answer. The fraction is **0.4**: at
  the original 0.75 a short answer was gutted (`Jaws` finished as `J_ws`) and the back half of
  every clue turned into hangman. Raising it again means re-checking short answers, not long ones.
- **The solvers' side channel ships under the answer's own rule.** Once you solve a clue you get
  its answer, a chat with the other people who know it (`clue:chat` → `chat:new`), and a bump that
  pays the author. `serialize.ts` derives `clueChat` visibility from the same flag as
  `activeClue.answer`, so the two cannot drift: chat is unfiltered player writing that routinely
  contains the answer, and it is fanned out **per-socket** from `RoomManager.onChat`, never
  `toRoom`. If you add a way to see chat, you are adding a way to see the answer.
- **The server rewrites the HTML shell before serving it.** A room link pasted into a group chat
  is this game's only marketing surface, so `/r/:code` stamps live Open Graph tags (including the
  player count) into `index.html` via `server/src/realtime/og.ts`, and `/` gets origin-corrected
  ones. Two things this depends on, both easy to undo by accident: `express.static` is mounted with
  `index: false` (otherwise `/` is answered by the static file and never reaches the handler), and
  the `/r/:code` route is registered *before* the `app.get('*')` catch-all. `og:url`/`og:image` are
  built from `PUBLIC_ORIGIN`, so a domain move needs no code change — but the literals in
  `index.html` are the fallback for anything serving that file directly, so keep them on production.
  The room card is sent `Cache-Control: no-store`: a CDN holding "4 players waiting" for a room that
  ended an hour ago is worse than no card at all.
- **Numbers shown to the public must be real, and must be optional.** The landing page counter reads
  `GET /api/stats` (`server/src/stats.ts`), which is derived from `games.clues_guessed` — written in
  the same fire-and-forget insert as the rest of the game record. Every field is nullable and the
  query never throws: a database that is down yields nulls and the client renders nothing. It
  renders nothing at zero, too. That slot previously held a hardcoded `128,402`, and a fake number
  on a public site is the kind of detail that turns a launch thread into a thread about the author.
- **Game phases:** LOBBY → ROUND_INTRO → PROMPT_ASSIGNMENT → CLUE_CREATION → CLUE_REVEAL →
  GUESSING → CLUE_SCORING → ROUND_RESULTS → GAME_RESULTS → ROOM_CLOSED (`packages/shared/src/types.ts`).
- **Defaults:** 3 rounds, 60s clue creation, 30s guessing, 3 prompt swaps at 150 points each
  (`DEFAULT_ROOM_CONFIG`). Three rounds is a playtest-tuned choice for snappier first games; the
  host can raise it.

## Content

Prompts and packs are documented in [`docs/content-guidelines.md`](docs/content-guidelines.md).
Read that before adding prompts or proposing a new category — the bar for what makes a *good*
prompt is the whole game, and it is not obvious from the data file.

## Status

The first playtest went well (August 2026). Current work: fixing bugs surfaced in play, and
adding content.

A design review after that playtest drove the incentive pass above (time-weighted author points,
paid prompt swaps, the 0.4 hint fraction, the solved state / chat / bump). Two of its larger ideas
are **not** built and are still open: a **Blitz mode** that plays every clue in one shared window
instead of serially, and a **same-prompt voting round** where the whole room clues one prompt and
votes on the best clue. Both are pacing/format changes rather than tuning — the serial playback
loop is ~35s per player per round, so an 8-player game runs about 18 minutes.

## Known gap

`README.md` points at a design doc, `~/.claude/plans/i-want-to-build-dazzling-lemon.md`. Code
comments cite its sections (§3 state machine, §6 dealing, §7 rules & anti-cheat), but the file is
not in this repo and is not on every machine. If you have a copy, commit it under `docs/` and fix
the README link.
