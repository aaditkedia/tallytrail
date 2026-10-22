import { createDraft } from "@/lib/service";
import { readAppState } from "@/lib/storage";
import { assertOwner, failure, readJson } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const ownerId = await assertOwner(request);
    return Response.json(await readAppState(undefined, ownerId), { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return failure(error); }
}

export async function POST(request: Request) {
  try {
    const ownerId = await assertOwner(request, true);
    return Response.json(await createDraft(await readJson(request), undefined, ownerId), { status: 201 });
  } catch (error) { return failure(error); }
}
