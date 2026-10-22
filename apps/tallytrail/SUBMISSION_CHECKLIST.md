# IEEE ClimateChain — TallyTrail submission checklist

- [ ] Public GitHub repo with MIT license in About
- [ ] README setup + env example committed
- [ ] 3–5 min demo video (see `DEMO_SCRIPT.md`) uploaded per Devpost
- [ ] Devpost: **Carbon Markets & Emissions Transparency** track
- [ ] Live or recorded devnet tx: `submit_report` after confirmation, duplicate rejected on-chain
- [ ] Wording: “PoC / devnet / deterministic review” — no “AI agents” or unaudited “on-chain attestation” claims
- [ ] Optional hosted URL on Vercel with `DATABASE_URL`, Neon Auth, Blob configured
- [ ] Solana program id documented in README / env example
- [ ] No secrets in repo (wallet JSON, API keys, Neon strings)

## Owner-only setup (Aadit)

- [ ] Solana devnet wallet funded; `deploy-devnet.mjs` run; `SOLANA_PROGRAM_ID` + `SOLANA_WALLET_JSON` in Vercel
- [ ] Neon database + `npm run db:migrate`
- [ ] Neon Auth project URLs + cookie secret
- [ ] Vercel Blob token
- [ ] Vercel project env vars + production deploy
