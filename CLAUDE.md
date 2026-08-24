# Working on Moji

Moji is a real-time multiplayer party game: each player gets a secret prompt, builds an emoji
clue for it, and everyone races to guess each other's clues. Setup, scripts, and stack live in
`README.md` — this file records the things that aren't obvious from reading the code, so any
machine (or any session) starts with the same context.

## Design invariants

Break these only on purpose.

- **The server is authoritative.** Everything sent to clients goes through the role-filtered
  serializer in `packages/server/src/realtime/serialize.ts`, so a clue's prompt/answer is never
  present in a non-author's payload. Any new field on a clue/room needs a decision in that file.
- **Live room state is in memory, behind a seam.** `packages/server/src/rooms/RoomStore.ts` exists
  so state can move to Redis later without touching the state machine. Keep room mutation behind it.
- **Scoring is pure and config-driven.** `packages/shared/src/scoring.ts` — the state machine
  hard-codes no constants. Guesser points decay linearly 1000 → 150 across the guess window;
  author points are 130 per solver. That last one is deliberate: it replaced a "Goldilocks" curve
  that zeroed out too-obvious clues, because rewarding clues that land plays better.
- **Emoji validation runs on both sides.** `packages/shared/src/emoji-rules.ts` is enforced in the
  client for instant feedback *and* on the server as the authoritative backstop against pasted or
  tampered input. 1–10 emoji; no number emoji when the answer contains a digit; no spelling out
  the answer.
- **Letter hints are computed server-side and pushed one step at a time.**
  `shared/hints.ts` plans which letters drop when; `Room` ticks the schedule and emits `clue:hint`
  with the mask as it currently stands. The plan and the answer never leave the server, and the
  reveal fraction is floored so the mask can never become the answer.
- **Game phases:** LOBBY → ROUND_INTRO → PROMPT_ASSIGNMENT → CLUE_CREATION → CLUE_REVEAL →
  GUESSING → CLUE_SCORING → ROUND_RESULTS → GAME_RESULTS → ROOM_CLOSED (`packages/shared/src/types.ts`).
- **Defaults:** 3 rounds, 60s clue creation, 30s guessing (`DEFAULT_ROOM_CONFIG`). Three rounds is a
  playtest-tuned choice for snappier first games; the host can raise it.

## Content

Prompts and packs are documented in [`docs/content-guidelines.md`](docs/content-guidelines.md).
Read that before adding prompts or proposing a new category — the bar for what makes a *good*
prompt is the whole game, and it is not obvious from the data file.

## Status

The first playtest went well (August 2026). Current work: fixing bugs surfaced in play, and
adding content.

## Known gap

`README.md` points at a design doc, `~/.claude/plans/i-want-to-build-dazzling-lemon.md`. Code
comments cite its sections (§3 state machine, §6 dealing, §7 rules & anti-cheat), but the file is
not in this repo and is not on every machine. If you have a copy, commit it under `docs/` and fix
the README link.
