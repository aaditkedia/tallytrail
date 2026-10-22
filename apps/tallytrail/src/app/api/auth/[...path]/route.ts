import { getAuth } from "@/lib/auth/server";

export const runtime = "nodejs";

const auth = getAuth();
const missing = () => Response.json({ error: "Neon Auth is not configured. Set NEON_AUTH_BASE_URL and NEON_AUTH_COOKIE_SECRET." }, { status: 503 });

export async function GET(request: Request, context: { params: Promise<{ path: string[] }> }) {
  if (!auth) return missing();
  return auth.handler().GET(request, context);
}

export async function POST(request: Request, context: { params: Promise<{ path: string[] }> }) {
  if (!auth) return missing();
  return auth.handler().POST(request, context);
}
