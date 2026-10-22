import { integer, jsonb, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";

export const appState = pgTable("app_state", {
  ownerId: text("owner_id").primaryKey(),
  version: integer("version").notNull().default(1),
  reports: jsonb("reports").notNull().default([]),
  offsets: jsonb("offsets").notNull().default([]),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const evidenceFiles = pgTable("evidence_files", {
  id: text("id").primaryKey(),
  ownerId: text("owner_id").notNull(),
  sha256: text("sha256").notNull(),
  mime: text("mime").notNull(),
  bytes: integer("bytes").notNull(),
  storedAt: timestamp("stored_at", { withTimezone: true }).notNull(),
  blobUrl: text("blob_url"),
}, table => [uniqueIndex("evidence_owner_id").on(table.ownerId, table.id)]);
