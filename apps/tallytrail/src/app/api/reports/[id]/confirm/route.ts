import { z } from "zod";
import { confirmReport } from "@/lib/service";
import { assertOwner, failure, readJson } from "@/lib/http";

export const runtime = "nodejs";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const ownerId = await assertOwner(request, true);
    const { acknowledged } = z.object({ acknowledged: z.literal(true) }).strict().parse(await readJson(request));
    return Response.json(await confirmReport((await context.params).id, acknowledged, undefined, ownerId));
  } catch (error) { return failure(error); }
}
