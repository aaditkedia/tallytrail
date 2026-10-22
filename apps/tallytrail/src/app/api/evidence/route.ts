import { evidenceStorageLabel, handleEvidenceUpload, listEvidence } from "@/lib/evidence";
import { providerReadiness } from "@/lib/providers";
import { assertOwner, failure } from "@/lib/http";

export const runtime = "nodejs";
export const maxDuration = 40;
export const dynamic = "force-dynamic";

export async function POST(request: Request) { return handleEvidenceUpload(request); }

export async function GET(request: Request) {
  try {
    await assertOwner(request);
    return Response.json({
      evidence: await listEvidence(),
      vision: providerReadiness().vision,
      storage: evidenceStorageLabel(),
      supportedTypes: ["application/pdf", "image/jpeg", "image/png", "image/webp"],
      maxBytes: 4 * 1024 * 1024,
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return failure(error); }
}
