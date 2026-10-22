// Optional validator integration test. Requires installed Anchor/Solana toolchains,
// @coral-xyz/anchor, @solana/web3.js, a funded local wallet, and generated IDL.
import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import anchor from "@coral-xyz/anchor";
const { AnchorProvider, Program, BN, web3 } = anchor;
const provider = AnchorProvider.env();
const idl = JSON.parse(await readFile(new URL("../target/idl/tallytrail.json", import.meta.url), "utf8"));
const program = new Program(idl, provider);
const owner = provider.wallet.publicKey;
const hash = value => [...createHash("sha256").update(value).digest()];

test("same business + period cannot initialize a report twice", async () => {
  const period = "2026-09";
  const [report] = web3.PublicKey.findProgramAddressSync([Buffer.from("report"), owner.toBuffer(), Buffer.from(period)], program.programId);
  const submit = (evidence = "synthetic evidence") => program.methods.submitReport(period, hash(evidence), new BN(1_634_888)).accounts({ business: owner, report, systemProgram: web3.SystemProgram.programId }).rpc();
  await submit();
  await assert.rejects(submit("different synthetic evidence"), error => /already in use|already initialized/i.test([String(error), ...(error.logs || error.transactionLogs || [])].join("\n")));
  const saved = await program.account.report.fetch(report);
  assert.equal(saved.period, period);
  assert.equal(saved.totalGramsCo2E.toString(), "1634888");
});
test("same registry + serial cannot initialize a retirement twice", async () => {
  const serialHash = hash("DEMO-2026-001");
  const [retirement] = web3.PublicKey.findProgramAddressSync([Buffer.from("offset"), owner.toBuffer(), Buffer.from(serialHash)], program.programId);
  const retire = (grams = 1_000_000) => program.methods.retireOffset(serialHash, new BN(grams), owner).accounts({ registry: owner, retirement, systemProgram: web3.SystemProgram.programId }).rpc();
  await retire();
  await assert.rejects(retire(1_000_001), error => /already in use|already initialized/i.test([String(error), ...(error.logs || error.transactionLogs || [])].join("\n")));
  const saved = await program.account.offsetRetirement.fetch(retirement);
  assert.equal(saved.gramsCo2E.toString(), "1000000");
});
