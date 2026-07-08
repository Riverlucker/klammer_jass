import { pgTable, text, timestamp, jsonb, integer, boolean } from "drizzle-orm/pg-core";

export const users = pgTable("users", {
  id: text("id").primaryKey(), // Could be a Clerk ID or a generated UUID
  name: text("name").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const matches = pgTable("matches", {
  id: text("id").primaryKey(), // Match ID
  player1Id: text("player1_id").references(() => users.id),
  player2Id: text("player2_id").references(() => users.id),
  targetScore: integer("target_score").default(301).notNull(),
  schneiderRule: text("schneider_rule").default("yes").notNull(), // 'yes', 'no', 'only_if_doubled'
  cubeEnabled: boolean("cube_enabled").default(true).notNull(),
  bet: integer("bet").default(1).notNull(),
  status: text("status").default("waiting").notNull(), // 'waiting', 'in_progress', 'finished', 'paused'
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const games = pgTable("games", {
  id: text("id").primaryKey(), // Boardgame.io Match ID
  matchId: text("match_id").references(() => matches.id), // The overarching series/match
  state: jsonb("state").notNull(), // The boardgame.io JSON state
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});
