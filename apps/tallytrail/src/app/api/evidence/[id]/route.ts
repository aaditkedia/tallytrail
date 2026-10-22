import { deleteEvidence, loadEvidence } from "@/lib/evidence";
import { assertOwner, failure } from "@/lib/http";

export const runtime = "nodejs";

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const ownerId = await assertOwner(request);
    const { meta, bytes } = await loadEvidence((await context.params).id, undefined, ownerId);
    return new Response(new Uint8Array(bytes), {
      status: 200,
      headers: {
        "Content-Type": meta.mime,
        "Content-Disposition": `attachment; filename="${meta.id}"`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch (error) { return failure(error); }
}

export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const ownerId = await assertOwner(request, true);
    await deleteEvidence((await context.params).id, undefined, ownerId);
    return Response.json({ deleted: true });
  } catch (error) { return failure(error); }
}
