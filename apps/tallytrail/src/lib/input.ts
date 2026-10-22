// Browser-safe validation shared by JSON import, report routes and vision output.
import { z } from "zod";

const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(value => {
  const parsed = new Date(`${value}T00:00:00Z`);
  return !value.startsWith("0000-") && Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}, "Use a real calendar date with a year from 0001 to 9999");
const itemBase = { amount: z.number().finite().positive().max(10_000_000), label: z.string().trim().min(1).max(100) };
export const lineItemSchema = z.discriminatedUnion("kind", [
  z.object({ ...itemBase, kind: z.literal("electricity"), unit: z.literal("kWh") }).strict(),
  z.object({ ...itemBase, kind: z.literal("natural_gas"), unit: z.literal("therm") }).strict(),
  z.object({ ...itemBase, kind: z.literal("stationary_diesel"), unit: z.literal("gallon") }).strict(),
]);
export const reportInputSchema = z.object({
  business: z.string().trim().min(2).max(80), periodStart: date, periodEnd: date,
  region: z.enum(["RFCE", "CAMX", "ERCT"]),
  inputMode: z.enum(["synthetic", "manual"]).default("synthetic"),
  evidenceSha256: z.string().regex(/^[a-f0-9]{64}$/).optional(),
  lineItems: z.array(lineItemSchema).min(1).max(30),
}).strict().superRefine((value, ctx) => {
  if (value.periodStart > value.periodEnd) ctx.addIssue({ code: "custom", path: ["periodEnd"], message: "End must follow start" });
  if ((Date.parse(value.periodEnd) - Date.parse(value.periodStart)) / 86400000 > 366) ctx.addIssue({ code: "custom", path: ["periodEnd"], message: "Use a reporting period of at most 367 days" });
});
export type ReportInput = z.infer<typeof reportInputSchema>;
