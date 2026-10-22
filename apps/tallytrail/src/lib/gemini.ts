import "server-only";
import type { ReportInput } from "./domain";
import { extractWithTransport, type ExtractionFile } from "./vision-contract";
import { DomainError } from "./service";
export async function extractBill(file: ExtractionFile, region: ReportInput["region"]) {
  if (process.env.TALLYTRAIL_GEMINI_ENABLED !== "true" || !process.env.GEMINI_API_KEY?.trim()) throw new DomainError("Gemini extraction is disabled. Configure the server explicitly first.", 503);
  return extractWithTransport(file, region, process.env.GEMINI_API_KEY, fetch);
}
