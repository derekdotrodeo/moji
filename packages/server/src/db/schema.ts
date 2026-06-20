/**
 * Durable Postgres schema (design doc §5). Live room state is NOT here — it
 * lives in memory (RoomStore) for the MVP. We persist content, completed-game
 * records, moderation, and analytics.
 */
import { relations } from 'drizzle-orm';
import {
  bigserial,
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  smallint,
  text,
  timestamp,
  unique,
  uuid,
} from 'drizzle-orm/pg-core';

// ── Identity (MVP: mostly guests; schema ready for real accounts) ──
export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  displayName: text('display_name').notNull(),
  isGuest: boolean('is_guest').notNull().default(true),
  authProvider: text('auth_provider'),
  authSubject: text('auth_subject'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  lastSeenAt: timestamp('last_seen_at', { withTimezone: true }),
});

// ── Content ──
export const categories = pgTable('categories', {
  id: uuid('id').primaryKey().defaultRandom(),
  slug: text('slug').notNull().unique(),
  name: text('name').notNull(),
  description: text('description'),
  isActive: boolean('is_active').notNull().default(true),
  sortOrder: integer('sort_order').default(0),
});

export const prompts = pgTable(
  'prompts',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    categoryId: uuid('category_id')
      .notNull()
      .references(() => categories.id),
    answer: text('answer').notNull(),
    difficulty: smallint('difficulty').notNull().default(2), // 1..5
    popularity: smallint('popularity'), // 1..5 mainstream-ness
    status: text('status').notNull().default('draft'), // draft|review|approved|retired
    language: text('language').notNull().default('en'),
    notes: text('notes'),
    createdBy: uuid('created_by').references(() => users.id),
    approvedBy: uuid('approved_by').references(() => users.id),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    byCategoryStatus: index('prompts_category_status_idx').on(t.categoryId, t.status, t.difficulty),
  }),
);

export const promptAnswers = pgTable('prompt_answers', {
  id: uuid('id').primaryKey().defaultRandom(),
  promptId: uuid('prompt_id')
    .notNull()
    .references(() => prompts.id, { onDelete: 'cascade' }),
  text: text('text').notNull(),
  matchType: text('match_type').notNull().default('alias'), // canonical|alias|common_misspelling
  isBlocklist: boolean('is_blocklist').notNull().default(false),
});

export const promptForbiddenTokens = pgTable('prompt_forbidden_tokens', {
  id: uuid('id').primaryKey().defaultRandom(),
  promptId: uuid('prompt_id')
    .notNull()
    .references(() => prompts.id, { onDelete: 'cascade' }),
  token: text('token').notNull(),
});

// ── Game records (written at/after completion) ──
export const games = pgTable('games', {
  id: uuid('id').primaryKey().defaultRandom(),
  roomCode: text('room_code').notNull(),
  hostUserId: uuid('host_user_id').references(() => users.id),
  config: jsonb('config').notNull(),
  status: text('status').notNull(), // in_progress|completed|abandoned
  startedAt: timestamp('started_at', { withTimezone: true }),
  endedAt: timestamp('ended_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const gamePlayers = pgTable(
  'game_players',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    gameId: uuid('game_id')
      .notNull()
      .references(() => games.id, { onDelete: 'cascade' }),
    userId: uuid('user_id').references(() => users.id),
    displayName: text('display_name').notNull(),
    finalScore: integer('final_score').notNull().default(0),
    finalRank: integer('final_rank'),
  },
  (t) => ({ uniqGamePlayer: unique('game_players_game_user_uq').on(t.gameId, t.userId) }),
);

export const rounds = pgTable(
  'rounds',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    gameId: uuid('game_id')
      .notNull()
      .references(() => games.id, { onDelete: 'cascade' }),
    roundNumber: integer('round_number').notNull(),
    categoryId: uuid('category_id').references(() => categories.id),
  },
  (t) => ({ uniqRound: unique('rounds_game_number_uq').on(t.gameId, t.roundNumber) }),
);

export const cluePlays = pgTable(
  'clue_plays',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    roundId: uuid('round_id')
      .notNull()
      .references(() => rounds.id, { onDelete: 'cascade' }),
    authorUserId: uuid('author_user_id').references(() => users.id),
    promptId: uuid('prompt_id').references(() => prompts.id),
    emojiClue: text('emoji_clue').notNull(),
    emojiCount: smallint('emoji_count').notNull(),
    solvedCount: integer('solved_count').notNull().default(0),
    eligibleCount: integer('eligible_count').notNull().default(0),
    authorPoints: integer('author_points').notNull().default(0),
    durationMs: integer('duration_ms'),
  },
  (t) => ({ uniqCluePlay: unique('clue_plays_round_author_uq').on(t.roundId, t.authorUserId) }),
);

export const guesses = pgTable(
  'guesses',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    cluePlayId: uuid('clue_play_id')
      .notNull()
      .references(() => cluePlays.id, { onDelete: 'cascade' }),
    guesserUserId: uuid('guesser_user_id').references(() => users.id),
    text: text('text').notNull(),
    isCorrect: boolean('is_correct').notNull(),
    solveRank: integer('solve_rank'),
    msFromReveal: integer('ms_from_reveal'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({ byCluePlay: index('guesses_clue_play_idx').on(t.cluePlayId) }),
);

export const scores = pgTable(
  'scores',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    gameId: uuid('game_id')
      .notNull()
      .references(() => games.id, { onDelete: 'cascade' }),
    roundId: uuid('round_id')
      .notNull()
      .references(() => rounds.id, { onDelete: 'cascade' }),
    userId: uuid('user_id').references(() => users.id),
    guesserPoints: integer('guesser_points').notNull().default(0),
    authorPoints: integer('author_points').notNull().default(0),
  },
  (t) => ({ uniqScore: unique('scores_round_user_uq').on(t.roundId, t.userId) }),
);

// ── Moderation & analytics ──
export const reports = pgTable('reports', {
  id: uuid('id').primaryKey().defaultRandom(),
  reporterUserId: uuid('reporter_user_id').references(() => users.id),
  targetType: text('target_type').notNull(), // username|room_name|clue|guess
  targetRef: text('target_ref').notNull(),
  gameId: uuid('game_id').references(() => games.id),
  reason: text('reason'),
  status: text('status').notNull().default('open'), // open|reviewed|actioned|dismissed
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const moderationBlocklist = pgTable('moderation_blocklist', {
  id: uuid('id').primaryKey().defaultRandom(),
  pattern: text('pattern').notNull(),
  kind: text('kind').notNull(), // word|regex
  appliesTo: text('applies_to').notNull(), // username|room_name|guess|all
  severity: text('severity').notNull().default('block'), // block|flag
});

export const analyticsEvents = pgTable(
  'analytics_events',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    eventType: text('event_type').notNull(),
    userId: uuid('user_id'),
    gameId: uuid('game_id'),
    payload: jsonb('payload'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({ byTypeTime: index('analytics_type_time_idx').on(t.eventType, t.createdAt) }),
);

// ── Relations (handy for queries) ──
export const categoriesRel = relations(categories, ({ many }) => ({
  prompts: many(prompts),
}));

export const promptsRel = relations(prompts, ({ one, many }) => ({
  category: one(categories, { fields: [prompts.categoryId], references: [categories.id] }),
  answers: many(promptAnswers),
  forbiddenTokens: many(promptForbiddenTokens),
}));
