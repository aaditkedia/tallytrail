import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import type { Report, Offset } from "./domain";

export type State = { version: 1; reports: Report[]; offsets: Offset[] };
const empty = (): State => ({ version: 1, reports: [], offsets: [] });
export const dataDirectory = () => process.env.TALLYTRAIL_DATA_DIR || path.join(process.cwd(), ".data");
export async function readState(directory = dataDirectory()): Promise<State> {
  try {
    const state = JSON.parse(await readFile(path.join(directory, "state.json"), "utf8")) as State;
    if (state.version !== 1 || !Array.isArray(state.reports) || !Array.isArray(state.offsets)) throw new Error("Invalid local data file");
    return state;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return empty();
    throw error;
  }
}
/** mkdir is the cross-process mutex; rename atomically commits. Fail closed on lock contention. */
export async function mutateState<T>(operation: (state: State) => T | Promise<T>, directory = dataDirectory()): Promise<T> {
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const lock = path.join(directory, "write.lock");
  let acquired = false;
  for (let attempt = 0; attempt < 40; attempt++) {
    try { await mkdir(lock); acquired = true; break; }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
      await new Promise(resolve => setTimeout(resolve, 25));
    }
  }
  if (!acquired) throw new Error("Local storage is busy. Retry once; after a crash remove .data/write.lock only when no app process is running.");
  const temp = path.join(directory, `state.${randomUUID()}.tmp`);
  try {
    const state = await readState(directory);
    const result = await operation(state);
    await writeFile(temp, JSON.stringify(state, null, 2), { mode: 0o600, flag: "wx" });
    await rename(temp, path.join(directory, "state.json"));
    return result;
  } finally {
    await rm(temp, { force: true });
    await rm(lock, { recursive: true, force: true });
  }
}
