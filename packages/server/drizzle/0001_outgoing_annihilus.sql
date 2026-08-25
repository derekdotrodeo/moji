ALTER TABLE "games" ADD COLUMN "clues_guessed" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
CREATE INDEX "games_ended_at_idx" ON "games" USING btree ("ended_at");