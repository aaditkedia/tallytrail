import { eq } from "drizzle-orm";
import type { State } from "./store";
import { getDb, schema } from "@/db";
import { DomainError } from "./service";

const empty = (): State => ({ version: 1, reports: [], offsets: [] });

export async function readPgState(ownerId: string): Promise<State> {
  const db = getDb();
  const [row] = await db.select().from(schema.appState).where(eq(schema.appState.ownerId, ownerId)).limit(1);
  if (!row) return empty();
  const state: State = { version: 1, reports: row.reports as State["reports"], offsets: row.offsets as State["offsets"] };
  if (state.version !== 1 || !Array.isArray(state.reports) || !Array.isArray(state.offsets)) throw new DomainError("Invalid database state", 503);
  return state;
}

export async function mutatePgState<T>(operation: (state: State) => T | Promise<T>, ownerId: string): Promise<T> {
  const db = getDb();
  const existing = await readPgState(ownerId);
  const result = await operation(existing);
  await db.insert(schema.appState).values({
    ownerId,
    version: 1,
    reports: existing.reports,
    offsets: existing.offsets,
    updatedAt: new Date(),
  }).onConflictDoUpdate({
    target: schema.appState.ownerId,
    set: { reports: existing.reports, offsets: existing.offsets, updatedAt: new Date(), version: 1 },
  });
  return result;
}
