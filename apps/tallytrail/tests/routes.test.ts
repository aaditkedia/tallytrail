import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { GET as downloadOriginal, DELETE as removeOriginal } from "../src/app/api/evidence/[id]/route";
import { DELETE as discardReport } from "../src/app/api/reports/[id]/route";
import { storeEvidence } from "../src/lib/evidence";
import { confirmReport, createDraft } from "../src/lib/service";
import { SAMPLE_REPORT } from "../src/lib/sample";

test("private download/delete handlers guard origins, suppress caching, and delete damaged originals", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "tallytrail-route-"));
  const previous = process.env.TALLYTRAIL_DATA_DIR; process.env.TALLYTRAIL_DATA_DIR = directory;
  try {
    const bytes = Buffer.from("%PDF-1.4\nSynthetic route fixture");
    const file = await storeEvidence(bytes, "application/pdf");
    const context = { params: Promise.resolve({ id: file.id }) };
    assert.equal((await downloadOriginal(new Request("https://external.example/api/evidence/x"), context)).status, 403);
    const downloaded = await downloadOriginal(new Request("http://localhost:3101/api/evidence/x"), context);
    assert.equal(downloaded.status, 200);
    assert.equal(downloaded.headers.get("Content-Type"), "application/pdf");
    assert.equal(downloaded.headers.get("Cache-Control"), "private, no-store");
    assert.ok(downloaded.headers.get("Content-Disposition")?.startsWith("attachment;"));
    assert.deepEqual(Buffer.from(await downloaded.arrayBuffer()), bytes);
    assert.equal((await removeOriginal(new Request("http://localhost:3101/api/evidence/x", { method: "DELETE", headers: { Origin: "https://external.example" } }), context)).status, 403);
    await writeFile(path.join(directory, "evidence", `${file.id}.bin`), "damaged");
    assert.equal((await removeOriginal(new Request("http://localhost:3101/api/evidence/x", { method: "DELETE" }), context)).status, 200);
    assert.equal((await downloadOriginal(new Request("http://localhost:3101/api/evidence/x"), context)).status, 404);
  } finally { if (previous === undefined) delete process.env.TALLYTRAIL_DATA_DIR; else process.env.TALLYTRAIL_DATA_DIR = previous; await rm(directory, { recursive: true, force: true }); }
});
test("draft discard route rejects cross-origin writes and cannot erase a confirmed report", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "tallytrail-draft-route-"));
  const previous = process.env.TALLYTRAIL_DATA_DIR; process.env.TALLYTRAIL_DATA_DIR = directory;
  try {
    const draft = await createDraft(SAMPLE_REPORT);
    const context = { params: Promise.resolve({ id: draft.id }) };
    assert.equal((await discardReport(new Request("http://localhost:3101/api/reports/x", { method: "DELETE", headers: { Origin: "https://external.example" } }), context)).status, 403);
    await confirmReport(draft.id, true);
    assert.equal((await discardReport(new Request("http://localhost:3101/api/reports/x", { method: "DELETE" }), context)).status, 409);
  } finally { if (previous === undefined) delete process.env.TALLYTRAIL_DATA_DIR; else process.env.TALLYTRAIL_DATA_DIR = previous; await rm(directory, { recursive: true, force: true }); }
});
