#!/usr/bin/env node
/**
 * Deploy the TallyTrail Anchor program to Solana devnet.
 * Requires: solana CLI, anchor CLI, funded devnet keypair at SOLANA_WALLET_PATH (or default ~/.config/solana/id.json).
 *
 * Usage (from repo root):
 *   SOLANA_WALLET_PATH=~/.config/solana/id.json node apps/tallytrail/scripts/deploy-devnet.mjs
 */
import { spawnSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const anchorDir = path.join(path.dirname(fileURLToPath(import.meta.url)), "../anchor");
const wallet = process.env.SOLANA_WALLET_PATH || `${process.env.HOME}/.config/solana/id.json`;

function run(cmd, args, cwd = anchorDir) {
  const result = spawnSync(cmd, args, { cwd, stdio: "inherit", env: { ...process.env, ANCHOR_WALLET: wallet } });
  if (result.status !== 0) process.exit(result.status ?? 1);
}

run("solana", ["config", "set", "--url", "devnet"]);
run("anchor", ["build", "--no-idl", "--", "--tools-version", "v1.57"]);
run("anchor", ["idl", "build", "--out", "target/idl/tallytrail.json"]);
run("anchor", ["deploy", "--provider.cluster", "devnet"]);

const idl = JSON.parse(readFileSync(path.join(anchorDir, "target/idl/tallytrail.json"), "utf8"));
const programId = idl.address;
writeFileSync(path.join(anchorDir, "idl/tallytrail.json"), JSON.stringify(idl, null, 2));
console.log("\nDeployed program id:", programId);
console.log("Set in Vercel / .env.local:");
console.log(`SOLANA_PROGRAM_ID=${programId}`);
console.log("SOLANA_RPC_URL=https://api.devnet.solana.com");
console.log(`SOLANA_WALLET_JSON='[...]'  # same secret as ${wallet}`);
