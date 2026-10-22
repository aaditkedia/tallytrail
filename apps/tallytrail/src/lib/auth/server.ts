import "server-only";
import { createNeonAuth } from "@neondatabase/auth/next/server";
import { DomainError } from "../service";

let authInstance: ReturnType<typeof createNeonAuth> | null = null;

export function authEnabled(): boolean {
  return Boolean(process.env.NEON_AUTH_BASE_URL?.trim() && process.env.NEON_AUTH_COOKIE_SECRET?.trim());
}

export function getAuth() {
  if (!authEnabled()) return null;
  if (!authInstance) {
    authInstance = createNeonAuth({
      baseUrl: process.env.NEON_AUTH_BASE_URL!,
      cookies: { secret: process.env.NEON_AUTH_COOKIE_SECRET! },
    });
  }
  return authInstance;
}

export async function requireOwnerId(request: Request): Promise<string> {
  if (!process.env.DATABASE_URL?.trim()) return "local";
  const auth = getAuth();
  if (!auth) {
    throw new DomainError(
      "Hosted mode requires Neon Auth. Set NEON_AUTH_BASE_URL and NEON_AUTH_COOKIE_SECRET, or use TALLYTRAIL_STORAGE=json for offline JSON storage.",
      503,
    );
  }
  const { data: session } = await auth.getSession();
  const id = session?.user?.id;
  if (!id) throw new DomainError("Sign in required.", 401);
  return id;
}
