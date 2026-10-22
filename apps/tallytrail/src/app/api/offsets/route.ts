import { retireOffset } from "@/lib/service";
import { assertOwner, failure, readJson } from "@/lib/http";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const ownerId = await assertOwner(request, true);
    return Response.json(await retireOffset(await readJson(request), undefined, ownerId), { status: 201 });
  } catch (error) { return failure(error); }
}
