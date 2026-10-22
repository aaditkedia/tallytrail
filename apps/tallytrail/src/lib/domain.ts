import { createHash } from "node:crypto";
import { z } from "zod";
import { FACTOR_VERSION, factorFor } from "./factors";
import { reportInputSchema, type ReportInput } from "./input";
import { canonicalJson } from "./canonical";
export { reportInputSchema, lineItemSchema, type ReportInput } from "./input";
export { canonicalJson } from "./canonical";
export type AuditFlag = { code: string; severity: "warning" | "blocking"; message: string };
export const sha256 = (value: string) => createHash("sha256").update(value).digest("hex");
export const businessKey = (value: string) => value.trim().normalize("NFKC").replace(/\s+/g, " ").toLowerCase();
export function calculate(raw: unknown) {
  const input = reportInputSchema.parse(raw);
  const lines = input.lineItems.map(item => {
    const factor = factorFor(item.kind, input.region);
    return { ...item, ...factor, kgCo2e: item.amount * factor.value };
  });
  const scope1Kg = lines.filter(l => l.scope === 1).reduce((sum, l) => sum + l.kgCo2e, 0);
  const scope2Kg = lines.filter(l => l.scope === 2).reduce((sum, l) => sum + l.kgCo2e, 0);
  return { lines, scope1Kg, scope2Kg, totalKg: scope1Kg + scope2Kg, factorVersion: FACTOR_VERSION, accounting: "Scope 1 stationary combustion + Scope 2 location-based; excludes upstream emissions and market-based claims" };
}
export type Calculation = ReturnType<typeof calculate>;
export type Report = {
  id: string; input: ReportInput; calculation: Calculation; flags: AuditFlag[];
  hash: string; createdAt: string; confirmedAt?: string; status: "draft" | "confirmed";
  chain: {
    status: "not_submitted" | "submitted" | "skipped";
    network: "none" | "devnet";
    signature: string | null;
    explorerUrl?: string | null;
    detail?: string;
  };
  steps: { agent: string; status: string; detail: string; durationMs: number }[];
};
export function hashPayload(report: Pick<Report, "input" | "calculation">) {
  return { schema: "tallytrail.report.v1", input: report.input, calculation: report.calculation };
}
export function audit(input: ReportInput, previous: Report[]): AuditFlag[] {
  const flags: AuditFlag[] = [];
  const sameBusiness = previous.filter(r => r.status === "confirmed" && businessKey(r.input.business) === businessKey(input.business));
  const overlaps = sameBusiness.filter(r => input.periodStart <= r.input.periodEnd && input.periodEnd >= r.input.periodStart);
  if (overlaps.length) flags.push({ code: "OVERLAPPING_PERIOD", severity: "blocking", message: `Period overlaps ${overlaps.length} confirmed report(s). Correct the dates before confirming.` });
  if (input.evidenceSha256 && sameBusiness.some(report => report.input.evidenceSha256 === input.evidenceSha256)) flags.push({ code: "REUSED_EVIDENCE", severity: "warning", message: "This original-file fingerprint was used by an earlier confirmed report. Check that the same bill is not being counted twice." });
  const days = Math.max(1, (Date.parse(input.periodEnd) - Date.parse(input.periodStart)) / 86400000 + 1);
  for (const kind of ["electricity", "natural_gas", "stationary_diesel"] as const) {
    const current = input.lineItems.filter(l => l.kind === kind).reduce((sum, l) => sum + l.amount, 0);
    const history = sameBusiness.filter(r => r.input.periodEnd < input.periodStart).sort((a, b) => a.input.periodEnd.localeCompare(b.input.periodEnd)).slice(-3);
    const dailyHistory = history.map(r => {
      const daysInPeriod = Math.max(1, (Date.parse(r.input.periodEnd) - Date.parse(r.input.periodStart)) / 86400000 + 1);
      return r.input.lineItems.filter(l => l.kind === kind).reduce((s, l) => s + l.amount, 0) / daysInPeriod;
    }).filter(n => n > 0);
    const dailyBaseline = dailyHistory.reduce((s, n) => s + n, 0) / Math.max(1, dailyHistory.length);
    if (dailyHistory.length && current / days > dailyBaseline * 3) flags.push({ code: "HISTORY_OUTLIER", severity: "warning", message: `${kind.replaceAll("_", " ")} per day exceeds 3× the average of up to three earlier confirmed periods.` });
    if (current > (kind === "electricity" ? 100_000 : 10_000)) flags.push({ code: "HIGH_USAGE", severity: "warning", message: `${kind.replaceAll("_", " ")} exceeds the demo review threshold. Verify quantity and units.` });
  }
  if (!sameBusiness.length) flags.push({ code: "NO_HISTORY", severity: "warning", message: "First report: there is no usage history to compare. Review quantities manually." });
  if (input.inputMode === "synthetic") flags.push({ code: "SYNTHETIC", severity: "warning", message: "Synthetic demonstration data. This report must not be used as a real business claim." });
  if (!input.evidenceSha256) flags.push({ code: "NO_FILE_HASH", severity: "warning", message: "No original-file fingerprint attached. The report hash covers entered evidence and calculation only." });
  return flags;
}
export const offsetSchema = z.object({
  registry: z.string().trim().min(2).max(60).regex(/^[A-Za-z0-9 _.-]+$/),
  serial: z.string().trim().min(3).max(100).regex(/^[A-Za-z0-9_.:/-]+$/),
  tonnes: z.number().finite().positive().max(100_000).multipleOf(0.001),
  beneficiary: z.string().trim().min(2).max(80),
  acknowledged: z.literal(true),
}).strict();
export type Offset = z.infer<typeof offsetSchema> & { id: string; createdAt: string; status: "local_demo_record"; claimKey: string };
export const offsetKey = (registry: string, serial: string) => sha256(canonicalJson([registry.trim().normalize("NFKC").replace(/\s+/g, " ").toLowerCase(), serial.trim().normalize("NFKC").toUpperCase()]));
