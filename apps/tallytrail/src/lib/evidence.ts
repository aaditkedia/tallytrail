import { createHash, randomUUID } from "node:crypto";
import { lstat, mkdir, readFile, readdir, realpath, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { type ReportInput } from "./domain";
import { DomainError } from "./service";
import { dataDirectory } from "./store";
import { billMimeSchema, MAX_BILL_BYTES, type BillMime, type Extraction, type ExtractionFile } from "./vision-contract";
import { assertOwner, failure } from "./http";
import { usesJsonStorage } from "./storage";

const metadataSchema = z.object({ id: z.uuid(), sha256: z.string().regex(/^[a-f0-9]{64}$/), mime: billMimeSchema, bytes: z.number().int().positive().max(MAX_BILL_BYTES), storedAt: z.iso.datetime() }).strict();
export type EvidenceMetadata = z.infer<typeof metadataSchema>;
export type EvidenceEntry = { id: string; metadata: EvidenceMetadata | null; available: boolean };
export const MAX_PRIVATE_BILLS = 100;
type Options = { directory?: string; environment?: Record<string, string | undefined>; extract?: (file: ExtractionFile, region: ReportInput["region"]) => Promise<Extraction> };
const isMissing = (error: unknown) => (error as NodeJS.ErrnoException).code === "ENOENT";
function assertPrivatePath(directory: string) {
  if (path.resolve(directory).split(path.sep).some(part => part === "public" || part === ".next")) throw new DomainError("Private evidence storage cannot be inside a public or build directory.", 503);
}
async function evidenceFolder(directory: string, create = false) {
  assertPrivatePath(directory);
  if (create) await mkdir(directory, { recursive: true, mode: 0o700 });
  let actual = path.resolve(directory);
  try { actual = await realpath(actual); } catch (error) { if (!isMissing(error)) throw error; }
  assertPrivatePath(actual);
  let folder = path.join(actual, "evidence");
  if (create) await mkdir(folder, { recursive: true, mode: 0o700 });
  try { folder = await realpath(folder); } catch (error) { if (!isMissing(error)) throw error; }
  assertPrivatePath(folder);
  return folder;
}
async function evidenceIds(folder: string) {
  try { return [...new Set((await readdir(folder)).map(name => /^(.*)\.(bin|json)$/.exec(name)?.[1]).filter((id): id is string => Boolean(id && z.uuid().safeParse(id).success)))]; }
  catch (error) { if (isMissing(error)) return []; throw error; }
}
export async function listEvidence(directory = dataDirectory()): Promise<EvidenceEntry[]> {
  const folder = await evidenceFolder(directory);
  const entries = await Promise.all((await evidenceIds(folder)).map(async id => {
    let metadata: EvidenceMetadata | null = null;
    try { const parsed = metadataSchema.parse(JSON.parse(await readFile(path.join(folder, `${id}.json`), "utf8"))); if (parsed.id === id) metadata = parsed; } catch { /* Keep damaged records visible and removable. */ }
    let available = false;
    try { const file = await lstat(path.join(folder, `${id}.bin`)); available = Boolean(metadata && file.isFile() && file.size === metadata.bytes); } catch (error) { if (!isMissing(error)) throw error; }
    return { id, metadata, available };
  }));
  return entries.sort((a, b) => (b.metadata?.storedAt ?? "").localeCompare(a.metadata?.storedAt ?? ""));
}
function sniff(bytes: Buffer, mime: BillMime) {
  return mime === "application/pdf" ? bytes.subarray(0, 5).toString() === "%PDF-"
    : mime === "image/png" ? bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
    : mime === "image/jpeg" ? bytes.length >= 3 && bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255
    : bytes.subarray(0, 4).toString() === "RIFF" && bytes.subarray(8, 12).toString() === "WEBP";
}
export async function storeEvidence(bytes: Buffer, rawMime: string, directory = dataDirectory()): Promise<EvidenceMetadata> {
  const mime = billMimeSchema.parse(rawMime);
  if (!bytes.length || bytes.length > MAX_BILL_BYTES) throw new DomainError("Select one nonempty bill up to 4 MiB.", 413);
  if (!sniff(bytes, mime)) throw new DomainError("File contents do not match its declared supported type.", 400);
  const folder = await evidenceFolder(directory, true);
  if ((await evidenceIds(folder)).length >= MAX_PRIVATE_BILLS) throw new DomainError("Private bill limit reached (100). Delete files you no longer need before uploading another.", 429);
  const meta: EvidenceMetadata = { id: randomUUID(), sha256: sha256Bytes(bytes), mime, bytes: bytes.length, storedAt: new Date().toISOString() };
  // User filenames are deliberately never used in paths or response headers.
  await writeFile(path.join(folder, `${meta.id}.bin`), bytes, { mode: 0o600, flag: "wx" });
  try { await writeFile(path.join(folder, `${meta.id}.json`), JSON.stringify(meta), { mode: 0o600, flag: "wx" }); }
  catch (error) { await rm(path.join(folder, `${meta.id}.bin`), { force: true }); throw error; }
  return meta;
}
const sha256Bytes = (bytes: Buffer) => createHash("sha256").update(bytes).digest("hex");
export async function loadEvidence(id: string, directory = dataDirectory()) {
  if (!z.uuid().safeParse(id).success) throw new DomainError("Evidence not found", 404);
  const folder = await evidenceFolder(directory);
  try {
    const meta = metadataSchema.parse(JSON.parse(await readFile(path.join(folder, `${id}.json`), "utf8")));
    if (meta.id !== id) throw new DomainError("Evidence metadata does not match its identifier", 409);
    const file = await lstat(path.join(folder, `${id}.bin`));
    if (!file.isFile() || file.size !== meta.bytes) throw new DomainError("Evidence integrity check failed", 409);
    const bytes = await readFile(path.join(folder, `${id}.bin`));
    if (sha256Bytes(bytes) !== meta.sha256 || !sniff(bytes, meta.mime)) throw new DomainError("Evidence integrity check failed", 409);
    return { meta, bytes };
  } catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") throw new DomainError("Evidence not found", 404); throw error; }
}
export async function deleteEvidence(id: string, directory = dataDirectory()) {
  if (!z.uuid().safeParse(id).success) throw new DomainError("Evidence not found", 404);
  const folder = await evidenceFolder(directory);
  if (!(await evidenceIds(folder)).includes(id)) throw new DomainError("Evidence not found", 404);
  // Deletion must work even when either file is missing or its hash is damaged.
  await rm(path.join(folder, `${id}.bin`), { force: true });
  await rm(path.join(folder, `${id}.json`), { force: true });
}
async function boundedMultipart(request: Request) {
  const max = MAX_BILL_BYTES + 64 * 1024;
  if (!request.headers.get("content-type")?.startsWith("multipart/form-data;")) throw new DomainError("Multipart upload required", 400);
  if (Number(request.headers.get("content-length") || 0) > max) throw new DomainError("Upload request too large", 413);
  const reader = request.body?.getReader();
  if (!reader) throw new DomainError("Upload body required", 400);
  const chunks: Uint8Array[] = []; let size = 0;
  while (true) { const { done, value } = await reader.read(); if (done) break; size += value.byteLength; if (size > max) { await reader.cancel(); throw new DomainError("Upload request too large", 413); } chunks.push(value); }
  try { return await new Response(Buffer.concat(chunks), { headers: { "Content-Type": request.headers.get("content-type")! } }).formData(); }
  catch { throw new DomainError("Malformed multipart upload", 400); }
}
/** Route implementation is dependency-injectable so regression tests never call a provider. */
export function evidenceStorageLabel(): string {
  if (usesJsonStorage()) return "private_local";
  if (!process.env.BLOB_READ_WRITE_TOKEN?.trim()) return "blob_missing";
  return "vercel_blob";
}

export async function handleEvidenceUpload(request: Request, options: Options = {}) {
  try {
    await assertOwner(request, true);
    const form = await boundedMultipart(request);
    if (form.get("storageConsent") !== "true") throw new DomainError("Explicit private storage consent is required.", 400);
    if (!usesJsonStorage(options.directory) && !process.env.BLOB_READ_WRITE_TOKEN?.trim()) {
      throw new DomainError("Hosted bill storage requires BLOB_READ_WRITE_TOKEN.", 503);
    }
    const region = z.enum(["RFCE", "CAMX", "ERCT"]).parse(form.get("region"));
    const extractionConsent = form.get("extractionConsent") === "true";
    const environment = options.environment ?? process.env;
    if (extractionConsent && (environment.TALLYTRAIL_GEMINI_ENABLED !== "true" || !environment.GEMINI_API_KEY?.trim())) throw new DomainError("Gemini extraction is disabled. Use private upload without extraction or enter data manually.", 503);
    const file = form.get("file");
    if (!(file instanceof File) || form.getAll("file").length !== 1) throw new DomainError("Select exactly one bill file", 400);
    const bytes = Buffer.from(await file.arrayBuffer());
    const meta = await storeEvidence(bytes, file.type, options.directory);
    if (!extractionConsent) return Response.json({ evidence: meta, extraction: null, message: "Stored privately on this machine. No provider was called; enter quantities manually." }, { status: 201 });
    // The provider receives only the selected file, never filenames or local paths.
    try {
      const extract = options.extract ?? (await import("./gemini")).extractBill;
      const extraction = await extract({ bytes, mime: meta.mime, sha256: meta.sha256 }, region);
      return Response.json({ evidence: meta, extraction, message: "Extraction requires human review. No report was created or confirmed." }, { status: 201 });
    } catch (error) {
      await deleteEvidence(meta.id, options.directory);
      throw error;
    }
  } catch (error) { return failure(error); }
}
