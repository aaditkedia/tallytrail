import { randomUUID } from "node:crypto";
import { runSwarm } from "@hackathon/swarm-core";
import { z } from "zod";
import { audit, calculate, canonicalJson, hashPayload, offsetKey, offsetSchema, reportInputSchema, sha256 } from "./domain";
import type { Report } from "./domain";
import { retireOffsetOnChain, submitReportOnChain } from "./chain";
import { mutateAppState, readAppState } from "./storage";

import { DomainError } from "./errors";
export { DomainError } from "./errors";

export async function createDraft(raw: unknown, directory?: string, ownerId = "local") {
  const input = reportInputSchema.parse(raw);
  const calculation = calculate(input);
  return mutateAppState(async state => {
    if (state.reports.length >= 500) throw new DomainError("Report limit reached. Archive older records before continuing.", 429);
    const flags = audit(input, state.reports);
    const trace = await runSwarm({
      input,
      planner: { name: "Evidence reviewer", outputSchema: reportInputSchema, execute: async () => input },
      specialists: [{ name: "Factor specialist", outputSchema: z.object({ totalKg: z.number().finite().nonnegative(), scope1Kg: z.number().finite().nonnegative(), scope2Kg: z.number().finite().nonnegative(), factorVersion: z.string() }), execute: async () => calculation }],
      critic: { name: "Auditor", outputSchema: z.array(z.object({ code: z.string(), severity: z.enum(["warning", "blocking"]), message: z.string() })), execute: async (_input) => {
        const completed = (_input as { results: { status: string }[] }).results;
        if (completed.some(r => r.status !== "fulfilled")) throw new Error("Factor calculation failed");
        return flags;
      } },
      humanGate: true,
    });
    const report: Report = {
      id: `TT-${randomUUID().slice(0, 8).toUpperCase()}`, input, calculation, flags,
      hash: sha256(canonicalJson(hashPayload({ input, calculation }))), createdAt: new Date().toISOString(),
      status: "draft", chain: { status: "not_submitted", network: "none", signature: null, explorerUrl: null, detail: "Not submitted on-chain yet." },
      steps: trace.steps.filter(step => step.status !== "running").map(step => ({
        agent: step.name, status: step.status === "awaiting_approval" ? "pending" : "complete", durationMs: step.durationMs ?? 0,
        detail: step.name === "Evidence reviewer" ? "Validated submitted fields. Review any optional extraction against the original bill; this calculation step makes no model calls." : step.name === "Factor specialist" ? `Applied ${calculation.factorVersion}; retained full precision.` : step.name === "Auditor" ? `${flags.length} review flag(s); ${flags.filter(f => f.severity === "blocking").length} blocking.` : "Owner must review evidence, quantities, region and calculation.",
      })),
    };
    state.reports.push(report);
    return report;
  }, directory, ownerId);
}

export async function confirmReport(id: string, acknowledged: boolean, directory?: string, ownerId = "local") {
  if (!acknowledged) throw new DomainError("Explicit review acknowledgement is required.", 400);
  return mutateAppState(async state => {
    const report = state.reports.find(r => r.id === id);
    if (!report) throw new DomainError("Report not found", 404);
    if (report.status === "confirmed") throw new DomainError("This report is already confirmed.");
    report.flags = audit(report.input, state.reports);
    if (report.flags.some(f => f.severity === "blocking")) throw new DomainError("Confirmation blocked: this business already has a confirmed report overlapping these dates.");
    if (sha256(canonicalJson(hashPayload(report))) !== report.hash) throw new DomainError("Stored report integrity check failed.");
    const chain = await submitReportOnChain(report);
    report.status = "confirmed";
    report.confirmedAt = new Date().toISOString();
    report.chain = chain;
    report.steps[3] = {
      agent: "Human gate",
      status: "complete",
      durationMs: 0,
      detail: chain.status === "submitted"
        ? `Confirmed ${report.confirmedAt}; devnet tx ${chain.signature}.`
        : `Confirmed ${report.confirmedAt}; ${chain.detail}`,
    };
    return report;
  }, directory, ownerId);
}

export async function retireOffset(raw: unknown, directory?: string, ownerId = "local") {
  const input = offsetSchema.parse(raw);
  return mutateAppState(async state => {
    const claimKey = offsetKey(input.registry, input.serial);
    if (state.offsets.some(o => o.claimKey === claimKey)) throw new DomainError("Duplicate registry + serial rejected. A record for this credit already exists.");
    if (state.offsets.length >= 500) throw new DomainError("Demo record limit reached.", 429);
    const chain = await retireOffsetOnChain(input.registry, input.serial, input.tonnes);
    const offset = {
      ...input,
      id: `OFF-${randomUUID().slice(0, 8).toUpperCase()}`,
      createdAt: new Date().toISOString(),
      status: "local_demo_record" as const,
      claimKey,
      chain,
    };
    state.offsets.push(offset);
    return offset;
  }, directory, ownerId);
}

export async function discardDraft(id: string, directory?: string, ownerId = "local") {
  return mutateAppState(state => {
    const index = state.reports.findIndex(report => report.id === id);
    if (index < 0) throw new DomainError("Draft not found", 404);
    if (state.reports[index].status !== "draft") throw new DomainError("Confirmed reports cannot be discarded.");
    state.reports.splice(index, 1);
    return { deleted: true };
  }, directory, ownerId);
}

export async function publicVerification(id: string, directory?: string, ownerId = "local") {
  const report = (await readAppState(directory, ownerId)).reports.find(r => r.id === id.trim().toUpperCase() && r.status === "confirmed");
  if (!report) throw new DomainError("Confirmed report not found", 404);
  const recomputed = sha256(canonicalJson(hashPayload(report)));
  return {
    id: report.id, hash: report.hash, recomputed, matches: report.hash === recomputed,
    periodStart: report.input.periodStart, periodEnd: report.input.periodEnd,
    totalKg: report.calculation.totalKg, scope1Kg: report.calculation.scope1Kg, scope2Kg: report.calculation.scope2Kg,
    factorVersion: report.calculation.factorVersion, inputMode: report.input.inputMode,
    confirmedAt: report.confirmedAt, chain: report.chain,
    evidenceAvailable: false,
    note: report.chain.status === "submitted"
      ? "Hash integrity check plus a devnet transaction signature when configured. Business name, files and entered line items remain private in this response."
      : "Hash integrity check. Business name, files and entered line items are private in this response.",
  };
}
