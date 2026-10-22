import test from "node:test";
import assert from "node:assert/strict";
import { mkdir, mkdtemp, readdir, rm, stat, symlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { handleEvidenceUpload, listEvidence, loadEvidence, deleteEvidence, storeEvidence } from "../src/lib/evidence";
import { extractWithTransport, GEMINI_ENDPOINT, geminiRequest, MAX_BILL_BYTES, parseGeminiResponse } from "../src/lib/vision-contract";
import { readState } from "../src/lib/store";

const pdf = Buffer.from("%PDF-1.4\nHandwritten synthetic test fixture; not a real bill.\n%%EOF");
const fingerprint = "a".repeat(64);
const extracted = { business: "Synthetic bakery", periodStart: "2026-09-01", periodEnd: "2026-09-30", lineItems: [{ label: "Electricity", kind: "electricity", amount: 2400, unit: "kWh" }] };
const providerEnvelope = (fields: unknown = extracted, finishReason = "STOP") => ({ candidates: [{ finishReason, content: { role: "model", parts: [{ text: JSON.stringify(fields) }] } }] });
const testFile = { bytes: pdf, mime: "application/pdf" as const, sha256: fingerprint };
function upload(fields: Record<string, string> = {}, file = new File([pdf], "../../secret.pdf", { type: "application/pdf" })) {
  const form = new FormData(); form.set("file", file); form.set("region", "RFCE"); form.set("storageConsent", "true");
  for (const [key, value] of Object.entries(fields)) form.set(key, value);
  return new Request("http://localhost:3101/api/evidence", { method: "POST", body: form });
}

test("handwritten Gemini REST shape becomes reviewed input; unsupported units and invalid dates fail", () => {
  const value = parseGeminiResponse(providerEnvelope(), "CAMX", fingerprint);
  assert.equal(value.input.region, "CAMX");
  assert.equal(value.input.inputMode, "manual");
  assert.equal(value.input.evidenceSha256, fingerprint);
  assert.equal(value.requiresReview, true);
  assert.throws(() => parseGeminiResponse(providerEnvelope({ ...extracted, periodStart: "2026-02-30" }), "RFCE", fingerprint));
  assert.throws(() => parseGeminiResponse(providerEnvelope({ ...extracted, lineItems: [{ ...extracted.lineItems[0], unit: "MWh" }] }), "RFCE", fingerprint));
  assert.throws(() => parseGeminiResponse(providerEnvelope(extracted, "MAX_TOKENS"), "RFCE", fingerprint), /complete/);
  assert.throws(() => parseGeminiResponse({ candidates: [] }, "RFCE", fingerprint));
});
test("official inlineData request shape and transport fix endpoint, key header, no redirects or retries", async () => {
  const request = geminiRequest(testFile);
  assert.equal(request.contents[0].parts[1].inlineData?.mimeType, "application/pdf");
  assert.equal(request.contents[0].parts[1].inlineData?.data, pdf.toString("base64"));
  assert.equal(request.generationConfig.responseFormat.text.mimeType, "application/json");
  let calls = 0;
  const transport: typeof fetch = async (url, options) => {
    calls++; assert.equal(url, GEMINI_ENDPOINT); assert.equal(options?.redirect, "error");
    assert.ok(options?.signal); assert.equal(new Headers(options?.headers).get("x-goog-api-key"), "offline-test-key");
    return Response.json(providerEnvelope());
  };
  const result = await extractWithTransport(testFile, "RFCE", "offline-test-key", transport);
  assert.equal(result.requiresReview, true); assert.equal(calls, 1);
  await assert.rejects(extractWithTransport(testFile, "RFCE", "offline-test-key", async () => { calls++; return new Response("private upstream detail", { status: 429 }); }), /HTTP 429/);
  assert.equal(calls, 2);
});
test("private upload works disabled, remains outside public, fingerprints bytes, supports deletion", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "tallytrail-upload-"));
  let providerCalls = 0;
  try {
    const response = await handleEvidenceUpload(upload(), { directory, environment: {}, extract: async () => { providerCalls++; throw new Error("must not call"); } });
    assert.equal(response.status, 201);
    const result = await response.json(); assert.equal(result.extraction, null); assert.equal(providerCalls, 0);
    const stored = await loadEvidence(result.evidence.id, directory);
    assert.ok(stored.bytes.equals(pdf)); assert.equal(stored.meta.bytes, pdf.length);
    assert.equal((await stat(path.join(directory, "evidence", `${stored.meta.id}.bin`))).mode & 0o777, 0o600);
    assert.equal((await readState(directory)).reports.length, 0);
    await assert.rejects(loadEvidence("../../secret", directory), /not found/);
    await deleteEvidence(stored.meta.id, directory);
    assert.deepEqual(await readdir(path.join(directory, "evidence")), []);
  } finally { await rm(directory, { recursive: true, force: true }); }
});
test("explicit server enablement, key and per-upload consent are all required", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "tallytrail-consent-"));
  let calls = 0;
  const extract = async () => { calls++; return parseGeminiResponse(providerEnvelope(), "RFCE", fingerprint); };
  try {
    const noStorage = await handleEvidenceUpload(upload({ storageConsent: "false", extractionConsent: "true" }), { directory, environment: {}, extract });
    assert.equal(noStorage.status, 400);
    for (const environment of [{}, { TALLYTRAIL_GEMINI_ENABLED: "true" }, { GEMINI_API_KEY: "offline-test-key" }, { TALLYTRAIL_GEMINI_ENABLED: "false", GEMINI_API_KEY: "offline-test-key" }]) {
      const response = await handleEvidenceUpload(upload({ extractionConsent: "true" }), { directory, environment, extract });
      assert.equal(response.status, 503);
    }
    assert.equal(calls, 0);
    const enabled = { TALLYTRAIL_GEMINI_ENABLED: "true", GEMINI_API_KEY: "offline-test-key" };
    const noExternalConsent = await handleEvidenceUpload(upload({ extractionConsent: "false" }), { directory, environment: enabled, extract });
    assert.equal(noExternalConsent.status, 201); assert.equal(calls, 0);
    const approved = await handleEvidenceUpload(upload({ extractionConsent: "true" }), { directory, environment: enabled, extract });
    assert.equal(approved.status, 201); assert.equal(calls, 1);
    assert.equal((await approved.json()).extraction.requiresReview, true);
    assert.equal((await readState(directory)).reports.length, 0);
  } finally { await rm(directory, { recursive: true, force: true }); }
});
test("upload route blocks cross-origin hosts, bad MIME, spoofed bytes, extra files, and streamed oversized bodies", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "tallytrail-invalid-"));
  try {
    const remote = new Request("https://public.example/api/evidence", { method: "POST" });
    assert.equal((await handleEvidenceUpload(remote, { directory })).status, 403);
    const crossOrigin = upload(); crossOrigin.headers.set("origin", "https://evil.example");
    assert.equal((await handleEvidenceUpload(crossOrigin, { directory })).status, 403);
    const mismatch = new File(["not a PNG"], "bill.png", { type: "image/png" });
    assert.equal((await handleEvidenceUpload(upload({}, mismatch), { directory })).status, 400);
    const unsupported = new File(["<svg/>"], "bill.svg", { type: "image/svg+xml" });
    assert.equal((await handleEvidenceUpload(upload({}, unsupported), { directory })).status, 400);
    const duplicate = new FormData(); duplicate.set("region", "RFCE"); duplicate.set("storageConsent", "true"); duplicate.append("file", new File([pdf], "a.pdf", { type: "application/pdf" })); duplicate.append("file", new File([pdf], "b.pdf", { type: "application/pdf" }));
    assert.equal((await handleEvidenceUpload(new Request("http://localhost:3101/api/evidence", { method: "POST", body: duplicate }), { directory })).status, 400);
    const oversized = new Request("http://localhost:3101/api/evidence", { method: "POST", headers: { "Content-Type": "multipart/form-data; boundary=unit-test" }, body: "x".repeat(MAX_BILL_BYTES + 65 * 1024) });
    assert.equal((await handleEvidenceUpload(oversized, { directory })).status, 413);
    await assert.rejects(storeEvidence(Buffer.alloc(MAX_BILL_BYTES + 1), "application/pdf", directory), /up to 4/);
  } finally { await rm(directory, { recursive: true, force: true }); }
});
test("provider failure removes the private original and never creates a report", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "tallytrail-extract-failure-"));
  try {
    const response = await handleEvidenceUpload(upload({ extractionConsent: "true" }), { directory, environment: { TALLYTRAIL_GEMINI_ENABLED: "true", GEMINI_API_KEY: "offline-test-key" }, extract: async () => { throw new Error("offline simulated failure"); } });
    assert.equal(response.status, 503);
    assert.deepEqual(await readdir(path.join(directory, "evidence")), []);
    assert.equal((await readState(directory)).reports.length, 0);
  } finally { await rm(directory, { recursive: true, force: true }); }
});
test("private originals remain discoverable after reload and damaged originals can still be deleted", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "tallytrail-recover-"));
  try {
    const one = await storeEvidence(pdf, "application/pdf", directory);
    const two = await storeEvidence(pdf, "application/pdf", directory);
    assert.equal((await listEvidence(directory)).length, 2);
    await writeFile(path.join(directory, "evidence", `${one.id}.json`), "broken metadata");
    await rm(path.join(directory, "evidence", `${two.id}.bin`));
    const visible = await listEvidence(directory);
    assert.equal(visible.find(file => file.id === one.id)?.metadata, null);
    assert.ok(visible.every(file => !file.available));
    await deleteEvidence(one.id, directory); await deleteEvidence(two.id, directory);
    assert.deepEqual(await listEvidence(directory), []);
    const corrupt = await storeEvidence(pdf, "application/pdf", directory);
    await writeFile(path.join(directory, "evidence", `${corrupt.id}.bin`), Buffer.alloc(pdf.length, "x"));
    await assert.rejects(loadEvidence(corrupt.id, directory), /integrity/);
    await deleteEvidence(corrupt.id, directory);
    assert.deepEqual(await listEvidence(directory), []);
  } finally { await rm(directory, { recursive: true, force: true }); }
});
test("private storage rejects public directories, including symlinked configuration", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "tallytrail-path-"));
  try {
    const exposed = path.join(directory, "public"); await mkdir(exposed);
    await assert.rejects(storeEvidence(pdf, "application/pdf", exposed), /public or build/);
    const alias = path.join(directory, "private-alias"); await symlink(exposed, alias, "dir");
    await assert.rejects(storeEvidence(pdf, "application/pdf", alias), /public or build/);
    await assert.rejects(listEvidence(alias), /public or build/);
    const nested = path.join(directory, "valid"); await mkdir(nested); await symlink(exposed, path.join(nested, "evidence"), "dir");
    await assert.rejects(storeEvidence(pdf, "application/pdf", nested), /public or build/);
    assert.deepEqual(await readdir(exposed), []);
  } finally { await rm(directory, { recursive: true, force: true }); }
});
