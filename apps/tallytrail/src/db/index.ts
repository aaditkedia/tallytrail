import "server-only";
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import * as schema from "./schema";

let cached: ReturnType<typeof drizzle<typeof schema>> | null = null;

export function requireDatabaseUrl(): string {
  const url = process.env.DATABASE_URL?.trim();
  if (!url) throw new Error("DATABASE_URL is required for hosted storage. For local JSON storage set TALLYTRAIL_STORAGE=json.");
  return url;
}

export function getDb() {
  if (!cached) cached = drizzle(neon(requireDatabaseUrl()), { schema });
  return cached;
}

export { schema };
