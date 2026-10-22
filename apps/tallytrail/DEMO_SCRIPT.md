# TallyTrail demo video script (~3–5 minutes)

**Tone:** honest PoC, devnet only, deterministic review (not AI agents).

1. **Intro (30s)** — Problem: small businesses need traceable emissions numbers; double-counting breaks carbon markets. Show TallyTrail overview tab; mention EPA factors and human confirmation.

2. **Sample report (60s)** — Click **Try a sample report**. Walk through 2,400 kWh + 185 therms, RFCE, September 2026. Click **Analyze evidence**. Open review modal: line math, auditor flags, deterministic review pipeline label.

3. **Confirm + hash (45s)** — Acknowledge checkbox → **Confirm**. Show SHA-256 receipt and verification page `/verify/TT-…`. Export JSON payload; note public endpoint redacts business name.

4. **Devnet (60s)** — With `SOLANA_*` env configured, confirm shows Explorer link. Attempt second September report for same month → on-chain duplicate error. Say program id and devnet only.

5. **Offset ledger (30s)** — Record demo retirement; retry same registry/serial → rejected (DB + chain when configured).

6. **Close (30s)** — Limits: not certified accounting, optional Gemini behind flag, hosted needs Neon/Vercel env. GitHub repo + IEEE Carbon Markets submission.
