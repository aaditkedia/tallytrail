import { ZodError } from "zod";
import { DomainError } from "./service";
import { requestOrigin } from "@hackathon/swarm-core";
import { usesJsonStorage } from "./storage";

export async function assertOwner(request: Request, mutation = false): Promise<string> {
  if (usesJsonStorage()) {
    const url = new URL(requestOrigin(request));
    if (!["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)) {
      throw new DomainError("JSON storage is local-only. Set DATABASE_URL for hosted mode or run on localhost.", 403);
    }
    const origin = request.headers.get("origin");
    if (mutation && origin && origin !== url.origin) throw new DomainError("Cross-origin write rejected", 403);
    const fetchSite = request.headers.get("sec-fetch-site");
    if (mutation && fetchSite === "cross-site") throw new DomainError("Cross-site write rejected", 403);
    return "local";
  }
  if (mutation) {
    const origin = request.headers.get("origin");
    const url = new URL(requestOrigin(request));
    if (origin && origin !== url.origin) throw new DomainError("Cross-origin write rejected", 403);
    const fetchSite = request.headers.get("sec-fetch-site");
    if (fetchSite === "cross-site") throw new DomainError("Cross-site write rejected", 403);
  }
  const { requireOwnerId } = await import("./auth/server");
  return requireOwnerId(request);
}

/** @deprecated use assertOwner */
export function assertLocal(request: Request, mutation = false) {
  const url = new URL(requestOrigin(request));
  if (!["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)) throw new DomainError("Owner endpoints are local-only. Configure real authentication before hosting.", 403);
  const origin = request.headers.get("origin");
  if (mutation && origin && origin !== url.origin) throw new DomainError("Cross-origin write rejected", 403);
  const fetchSite = request.headers.get("sec-fetch-site");
  if (mutation && fetchSite === "cross-site") throw new DomainError("Cross-site write rejected", 403);
}

export async function readJson(request: Request) {
  const maxBytes = 64 * 1024;
  if (Number(request.headers.get("content-length") || 0) > maxBytes) throw new DomainError("Request too large", 413);
  const reader = request.body?.getReader();
  if (!reader) throw new DomainError("JSON body required", 400);
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > maxBytes) { await reader.cancel(); throw new DomainError("Request too large", 413); }
    chunks.push(value);
  }
  try { return JSON.parse(Buffer.concat(chunks).toString("utf8")); }
  catch { throw new DomainError("Invalid JSON", 400); }
}

export function failure(error: unknown) {
  if (error instanceof ZodError) return Response.json({ error: "Check the input fields", issues: error.issues.map(i => ({ path: i.path.join("."), message: i.message })) }, { status: 400 });
  if (error instanceof DomainError) return Response.json({ error: error.message }, { status: error.status });
  console.error("TallyTrail failure", error instanceof Error ? error.message : "Unknown failure");
  const hosted = Boolean(process.env.DATABASE_URL?.trim());
  return Response.json({
    error: hosted
      ? "Storage is unavailable. Check DATABASE_URL, migrations, and server logs."
      : "Storage is unavailable. Check TALLYTRAIL_DATA_DIR permissions or switch to DATABASE_URL.",
  }, { status: 503 });
}

export async function authStatus() {
  const { authEnabled } = await import("./auth/server");
  return {
    database: Boolean(process.env.DATABASE_URL?.trim()),
    blob: Boolean(process.env.BLOB_READ_WRITE_TOKEN?.trim()),
    neonAuth: authEnabled(),
    jsonStorage: usesJsonStorage(),
  };
}
