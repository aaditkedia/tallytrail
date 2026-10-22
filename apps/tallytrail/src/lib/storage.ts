import type { State } from "./store";
import { dataDirectory, mutateState, readState } from "./store";

export function usesJsonStorage(directory?: string): boolean {
  if (directory !== undefined) return true;
  if (process.env.TALLYTRAIL_STORAGE === "json") return true;
  if (process.env.DATABASE_URL?.trim()) return false;
  if (process.env.NODE_ENV === "test") return true;
  return true;
}

export function jsonDirectory(directory?: string): string {
  return directory ?? dataDirectory();
}

export async function readAppState(directory?: string, ownerId = "local"): Promise<State> {
  if (usesJsonStorage(directory)) return readState(jsonDirectory(directory));
  const { readPgState } = await import("./repository-pg");
  return readPgState(ownerId);
}

export async function mutateAppState<T>(
  operation: (state: State) => T | Promise<T>,
  directory?: string,
  ownerId = "local",
): Promise<T> {
  if (usesJsonStorage(directory)) return mutateState(operation, jsonDirectory(directory));
  const { mutatePgState } = await import("./repository-pg");
  return mutatePgState(operation, ownerId);
}
