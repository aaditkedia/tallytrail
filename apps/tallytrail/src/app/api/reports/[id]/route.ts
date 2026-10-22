import { discardDraft } from "@/lib/service";
import { assertOwner, failure } from "@/lib/http";

export const runtime = "nodejs";

export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const ownerId = await assertOwner(request, true);
    return Response.json(await discardDraft((await context.params).id, undefined, ownerId));
  } catch (error) { return failure(error); }
}
