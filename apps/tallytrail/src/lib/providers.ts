import "server-only";

/** No credentials are imported by client components. No provider is called implicitly. */
export function providerReadiness() {
  return {
    vision: { configured: process.env.TALLYTRAIL_GEMINI_ENABLED === "true" && Boolean(process.env.GEMINI_API_KEY?.trim()), reason: "Optional Gemini bill extraction requires explicit server enablement and per-file consent; unverified until tested with configured credentials." },
    solana: { configured: false, reason: "Anchor program compiled and local-validator tests passed; devnet deployment and a report transaction adapter remain pending." },
    neon: { configured: false, reason: "Optional schema/migration examples are included; local JSON is the active repository." },
    blob: { configured: false, reason: "Optional private uploads use local .data/evidence only. Hosted Blob integration is not implemented." },
    auth: { configured: false, reason: "Local-only owner endpoints; authentication must be implemented before hosting." },
  };
}
