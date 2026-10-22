import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { calendarMonthPeriod, resetChainMock, submitReportOnChain } from "../src/lib/chain";
import { confirmReport, createDraft } from "../src/lib/service";
import { SAMPLE_REPORT } from "../src/lib/sample";
import type { Report } from "../src/lib/domain";

test("calendar month helper accepts full-month ranges only", () => {
  const draft = { id: "TT-TEST", input: SAMPLE_REPORT, calculation: { totalKg: 1, scope1Kg: 0, scope2Kg: 1, factorVersion: "x", lines: [], accounting: "" }, flags: [], hash: "a".repeat(64), createdAt: "", status: "draft" as const, chain: { status: "not_submitted" as const, network: "none" as const, signature: null }, steps: [] } satisfies Report;
  assert.equal(calendarMonthPeriod(draft), "2026-09");
  assert.equal(calendarMonthPeriod({ ...draft, id: "TT-TEST2", input: { ...SAMPLE_REPORT, periodStart: "2026-09-01", periodEnd: "2026-09-15" } }), null);
});

test("mock devnet rejects duplicate submit_report for the same month", async () => {
  const previous = process.env.TALLYTRAIL_CHAIN_MOCK;
  process.env.TALLYTRAIL_CHAIN_MOCK = "memory";
  resetChainMock();
  const dir = await mkdtemp(path.join(os.tmpdir(), "tallytrail-chain-"));
  try {
    const draft = await createDraft(SAMPLE_REPORT, dir);
    const first = await confirmReport(draft.id, true, dir);
    assert.equal(first.chain.status, "submitted");
    assert.ok(first.chain.explorerUrl);
    const second = await createDraft({ ...SAMPLE_REPORT, business: "Other name" }, dir);
    await assert.rejects(confirmReport(second.id, true, dir), /Duplicate on-chain/);
  } finally {
    if (previous === undefined) delete process.env.TALLYTRAIL_CHAIN_MOCK;
    else process.env.TALLYTRAIL_CHAIN_MOCK = previous;
    resetChainMock();
    await rm(dir, { recursive: true, force: true });
  }
});

test("submitReportOnChain mock returns skipped for partial months", async () => {
  const previous = process.env.TALLYTRAIL_CHAIN_MOCK;
  process.env.TALLYTRAIL_CHAIN_MOCK = "memory";
  resetChainMock();
  const draft = await createDraft({ ...SAMPLE_REPORT, periodStart: "2026-09-01", periodEnd: "2026-09-15" }, await mkdtemp(path.join(os.tmpdir(), "tallytrail-skip-")));
  const receipt = await submitReportOnChain(draft);
  assert.equal(receipt.status, "skipped");
  if (previous === undefined) delete process.env.TALLYTRAIL_CHAIN_MOCK;
  else process.env.TALLYTRAIL_CHAIN_MOCK = previous;
});
