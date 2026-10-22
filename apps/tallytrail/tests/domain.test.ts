import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { calculate, canonicalJson, reportInputSchema, offsetKey, hashPayload, sha256 } from "../src/lib/domain";
import { createDraft, confirmReport, discardDraft, retireOffset, publicVerification } from "../src/lib/service";
import { reportInputSchema as browserInputSchema } from "../src/lib/input";
import { assertLocal, readJson } from "../src/lib/http";
import { readState } from "../src/lib/store";
import { SAMPLE_REPORT } from "../src/lib/sample";

test("verified pilot: 2400 kWh RFCE plus 185 therms calculates both scopes", () => {
  const result = calculate(SAMPLE_REPORT);
  assert.ok(Math.abs(result.scope2Kg - 652.26945679896) < 1e-8);
  assert.ok(Math.abs(result.scope1Kg - 982.61825) < 1e-8);
  assert.ok(Math.abs(result.totalKg - 1634.88770679896) < 1e-8);
});
test("stationary diesel correctly converts CH4/N2O grams to kilograms", () => {
  const result = calculate({ ...SAMPLE_REPORT, lineItems: [{ kind: "stationary_diesel", unit: "gallon", amount: 10, label: "Generator" }] });
  assert.ok(Math.abs(result.totalKg - 102.4268) < 1e-8);
});
test("invalid units, dates, negative quantities, and unrecognized regions fail closed", () => {
  for (const changed of [
    { lineItems: [{ kind: "natural_gas", unit: "gallon", amount: 10, label: "Bad unit" }] },
    { periodStart: "2026-02-30" }, { periodEnd: "2025-01-01" },
    { region: "AUTO" }, { lineItems: [{ kind: "electricity", unit: "kWh", amount: -10, label: "Bad amount" }] },
  ]) assert.equal(reportInputSchema.safeParse({ ...SAMPLE_REPORT, ...changed }).success, false);
});
test("canonical hash is key-order independent and tamper sensitive", () => {
  assert.equal(sha256(canonicalJson({ z: [1, 2], a: 1 })), sha256(canonicalJson({ a: 1, z: [1, 2] })));
  assert.notEqual(sha256(canonicalJson({ a: 1 })), sha256(canonicalJson({ a: 2 })));
  assert.equal(offsetKey(" Demo  REGISTRY ", "demo-01"), offsetKey("demo registry", "DEMO-01"));
});
test("complete lifecycle persists, gates confirmation, verifies, and prevents races/duplicate credits", async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "tallytrail-test-"));
  try {
    const one = await createDraft(SAMPLE_REPORT, dir);
    assert.equal(one.status, "draft");
    assert.equal(one.hash, sha256(canonicalJson(hashPayload(one))));
    await assert.rejects(confirmReport(one.id, false, dir), /acknowledgement/);
    await assert.rejects(publicVerification(one.id, dir), /not found/);
    const two = await createDraft({ ...SAMPLE_REPORT, business: " JUNIPER   BAKERY (SYNTHETIC) " }, dir);
    const results = await Promise.allSettled([confirmReport(one.id, true, dir), confirmReport(two.id, true, dir)]);
    assert.equal(results.filter(r => r.status === "fulfilled").length, 1);
    assert.equal((await readState(dir)).reports.filter(r => r.status === "confirmed").length, 1);
    const saved = (await readState(dir)).reports.find(r => r.status === "confirmed")!;
    const verification = await publicVerification(saved.id, dir);
    assert.equal(verification.matches, true);
    assert.equal(verification.chain.signature, null);
    assert.equal("input" in verification, false);
    assert.equal("business" in verification, false);
    const offset = { registry: "Demo registry", serial: "DEMO-01", beneficiary: "Test beneficiary", tonnes: 1, acknowledged: true };
    const credits = await Promise.allSettled([retireOffset(offset, dir), retireOffset({ ...offset, registry: "DEMO REGISTRY", serial: "demo-01" }, dir)]);
    assert.equal(credits.filter(r => r.status === "fulfilled").length, 1);
    const original = JSON.parse(await readFile(path.join(dir, "state.json"), "utf8"));
    original.reports.find((r: { id: string }) => r.id === saved.id).calculation.totalKg += 1;
    await writeFile(path.join(dir, "state.json"), JSON.stringify(original));
    assert.equal((await publicVerification(saved.id, dir)).matches, false);
  } finally { await rm(dir, { recursive: true, force: true }); }
});
test("different periods can be confirmed but partially overlapping ranges cannot", async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "tallytrail-period-"));
  try {
    const first = await createDraft(SAMPLE_REPORT, dir); await confirmReport(first.id, true, dir);
    const next = await createDraft({ ...SAMPLE_REPORT, periodStart: "2026-10-01", periodEnd: "2026-10-31" }, dir);
    await confirmReport(next.id, true, dir);
    const overlap = await createDraft({ ...SAMPLE_REPORT, periodStart: "2026-09-20", periodEnd: "2026-10-02" }, dir);
    assert.ok(overlap.flags.some(f => f.code === "OVERLAPPING_PERIOD"));
    await assert.rejects(confirmReport(overlap.id, true, dir), /overlapping/);
  } finally { await rm(dir, { recursive: true, force: true }); }
});
test("local owner endpoints reject remote hosts and cross-origin writes", () => {
  assert.throws(() => assertLocal(new Request("https://public.example/api/reports")), /local-only/);
  assert.throws(() => assertLocal(new Request("http://localhost:3101/api/reports", { headers: { origin: "https://evil.example" } }), true), /Cross-origin/);
  assert.doesNotThrow(() => assertLocal(new Request("http://localhost:3101/api/reports", { headers: { origin: "http://localhost:3101" } }), true));
});
test("chunked JSON reads enforce the actual byte limit", async () => {
  await assert.rejects(readJson(new Request("http://localhost/api", { method: "POST", body: JSON.stringify({ text: "x".repeat(70_000) }) })), /too large/);
});
test("browser import shares strict validation, defaults synthetic mode, and rejects impossible input", () => {
  const { inputMode: removed, ...withoutMode } = SAMPLE_REPORT;
  assert.equal(browserInputSchema.parse(withoutMode).inputMode, "synthetic");
  for (const changed of [
    { periodStart: "0000-09-01", periodEnd: "0000-09-30" },
    { lineItems: [null] }, { lineItems: Array(31).fill(SAMPLE_REPORT.lineItems[0]) },
    { lineItems: [{ ...SAMPLE_REPORT.lineItems[0], unit: "therm" }] },
    { inputMode: "trusted" }, { extraPrivateField: "unexpected" },
  ]) assert.equal(browserInputSchema.safeParse({ ...SAMPLE_REPORT, ...changed }).success, false);
});
test("auditor uses the latest reporting periods even when history was entered out of order", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "tallytrail-history-"));
  try {
    for (const [month, lastDay, amount] of [["02", "28", 28], ["03", "31", 31], ["04", "30", 30], ["01", "31", 310_000]] as const) {
      const report = await createDraft({ ...SAMPLE_REPORT, periodStart: `2026-${month}-01`, periodEnd: `2026-${month}-${lastDay}`, lineItems: [{ kind: "electricity", label: "Electricity", amount, unit: "kWh" }] }, directory);
      await confirmReport(report.id, true, directory);
    }
    const current = await createDraft({ ...SAMPLE_REPORT, periodStart: "2026-05-01", periodEnd: "2026-05-31", lineItems: [{ kind: "electricity", label: "Electricity", amount: 310, unit: "kWh" }] }, directory);
    assert.ok(current.flags.some(flag => flag.code === "HISTORY_OUTLIER"));
  } finally { await rm(directory, { recursive: true, force: true }); }
});
test("reusing an original bill in a different period is visible to the reviewer", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "tallytrail-reused-"));
  try {
    const evidenceSha256 = "b".repeat(64);
    const first = await createDraft({ ...SAMPLE_REPORT, evidenceSha256 }, directory);
    await confirmReport(first.id, true, directory);
    const second = await createDraft({ ...SAMPLE_REPORT, evidenceSha256, periodStart: "2026-10-01", periodEnd: "2026-10-31" }, directory);
    assert.ok(second.flags.some(flag => flag.code === "REUSED_EVIDENCE" && flag.severity === "warning"));
  } finally { await rm(directory, { recursive: true, force: true }); }
});
test("drafts can be discarded, while confirmed reports are preserved", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "tallytrail-discard-"));
  try {
    const draft = await createDraft(SAMPLE_REPORT, directory);
    assert.deepEqual(await discardDraft(draft.id, directory), { deleted: true });
    assert.equal((await readState(directory)).reports.length, 0);
    const confirmed = await createDraft(SAMPLE_REPORT, directory);
    await confirmReport(confirmed.id, true, directory);
    await assert.rejects(discardDraft(confirmed.id, directory), /Confirmed reports cannot/);
    assert.equal((await publicVerification(confirmed.id.toLowerCase(), directory)).matches, true);
  } finally { await rm(directory, { recursive: true, force: true }); }
});
