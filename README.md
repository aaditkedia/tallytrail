# TallyTrail

IEEE ClimateChain hackathon — **Carbon Markets & Emissions Transparency** track.

Small businesses enter energy evidence, review EPA/eGRID-based Scope 1/2 calculations, confirm reports, and share SHA-256 verification receipts. Optional Solana devnet `submit_report` / `retire_offset` calls run **after** human confirmation when env vars are set.

## Stack

- Next.js 16 (App Router), React 19, TypeScript, Zod
- Shared packages: `@hackathon/swarm-core` (deterministic review pipeline), `@hackathon/ui`
- Storage: **JSON** (`TALLYTRAIL_STORAGE=json`) for local/tests, or **Neon Postgres** + Drizzle when `DATABASE_URL` is set
- Auth: **Neon Auth** when hosted (`NEON_AUTH_*`)
- Files: **Vercel Blob** when hosted (`BLOB_READ_WRITE_TOKEN`)
- Chain: Anchor program in `apps/tallytrail/anchor/`

## Quick start (local JSON)

```sh
npm install
cp apps/tallytrail/.env.example apps/tallytrail/.env.local
# ensure TALLYTRAIL_STORAGE=json
npm run dev
```

Open http://127.0.0.1:3101 — try the sample report, confirm, verify hash.

## Quality

```sh
npm run typecheck
npm test
npm run build --workspace @hackathon/tallytrail
```

Contract (optional, needs Anchor/Solana toolchains):

```sh
npm run build:contract
npm run test:contract
```

## Solana devnet deploy

1. Install Solana + Anchor CLIs; fund a devnet wallet (`solana airdrop 2`).
2. From repo root:

```sh
SOLANA_WALLET_PATH=~/.config/solana/id.json node apps/tallytrail/scripts/deploy-devnet.mjs
```

3. Copy printed `SOLANA_PROGRAM_ID` into `.env.local` / Vercel. Set `SOLANA_WALLET_JSON` to the wallet secret array for the server signer.

4. Confirm a **full calendar month** report (sample bakery is September 2026). The UI shows a Solana Explorer link; confirming the same month again fails on-chain.

## Hosted (Vercel + Neon)

1. Create Neon project → copy pooled `DATABASE_URL` and direct `DATABASE_URL_UNPOOLED`.
2. Run migration: `npm run db:migrate` (with env vars exported).
3. Enable Neon Auth in the Neon console → set `NEON_AUTH_BASE_URL` and `NEON_AUTH_COOKIE_SECRET`.
4. Create Vercel Blob store → `BLOB_READ_WRITE_TOKEN`.
5. Import repo in Vercel; set **Root Directory** to `apps/tallytrail` or use root `vercel.json`.
6. Add all env vars from `.env.example`.

Unset `TALLYTRAIL_STORAGE` (or remove `json`) so `DATABASE_URL` activates Postgres.

## Demo video script

See [apps/tallytrail/DEMO_SCRIPT.md](apps/tallytrail/DEMO_SCRIPT.md).

## Submission checklist

See [apps/tallytrail/SUBMISSION_CHECKLIST.md](apps/tallytrail/SUBMISSION_CHECKLIST.md).

## License

MIT — see [LICENSE](LICENSE).
