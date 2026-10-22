import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import type { Report } from "./domain";
import { DomainError } from "./errors";

export type ChainReceipt = {
  status: "submitted" | "skipped" | "not_submitted";
  network: "none" | "devnet";
  signature: string | null;
  explorerUrl: string | null;
  detail: string;
};

const mockSubmitted = new Set<string>();

export function chainConfigured(): boolean {
  if (process.env.TALLYTRAIL_CHAIN_MOCK === "memory") return true;
  return Boolean(process.env.SOLANA_PROGRAM_ID?.trim() && process.env.SOLANA_RPC_URL?.trim() && walletAvailable());
}

function walletAvailable(): boolean {
  return Boolean(process.env.SOLANA_WALLET_JSON?.trim() || process.env.SOLANA_WALLET_PATH?.trim());
}

export function calendarMonthPeriod(report: Report): string | null {
  const { periodStart, periodEnd } = report.input;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(periodStart) || !/^\d{4}-\d{2}-\d{2}$/.test(periodEnd)) return null;
  const [y, m, dStart] = periodStart.split("-").map(Number);
  const [y2, m2, dEnd] = periodEnd.split("-").map(Number);
  if (y !== y2 || m !== m2) return null;
  const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate();
  if (dStart !== 1 || dEnd !== lastDay) return null;
  return `${String(y).padStart(4, "0")}-${String(m).padStart(2, "0")}`;
}

function hashBytes(hex: string): number[] {
  const normalized = hex.trim().toLowerCase();
  if (!/^[a-f0-9]{64}$/.test(normalized)) throw new DomainError("Report hash must be 32-byte hex before on-chain submission.", 500);
  return [...Buffer.from(normalized, "hex")];
}

function loadWalletKeypair(): Uint8Array {
  if (process.env.SOLANA_WALLET_JSON) {
    const parsed = JSON.parse(process.env.SOLANA_WALLET_JSON) as number[];
    return Uint8Array.from(parsed);
  }
  if (process.env.SOLANA_WALLET_PATH) {
    const parsed = JSON.parse(readFileSync(process.env.SOLANA_WALLET_PATH, "utf8")) as number[];
    return Uint8Array.from(parsed);
  }
  throw new DomainError("Solana wallet not configured. Set SOLANA_WALLET_JSON or SOLANA_WALLET_PATH.", 503);
}

function explorerUrl(signature: string): string {
  return `https://explorer.solana.com/tx/${signature}?cluster=devnet`;
}

async function liveProgram() {
  const anchor = await import("@coral-xyz/anchor");
  const { Connection, Keypair, PublicKey, clusterApiUrl } = await import("@solana/web3.js");
  const idl = (await import("../../anchor/idl/tallytrail.json")).default;
  const programId = new PublicKey(process.env.SOLANA_PROGRAM_ID!);
  const connection = new Connection(process.env.SOLANA_RPC_URL || clusterApiUrl("devnet"), "confirmed");
  const wallet = Keypair.fromSecretKey(loadWalletKeypair());
  const provider = new anchor.AnchorProvider(connection, new anchor.Wallet(wallet), { commitment: "confirmed" });
  const program = new anchor.Program({ ...idl, address: programId.toBase58() }, provider);
  return { anchor, connection, wallet, program, PublicKey, web3: anchor.web3 };
}

export async function submitReportOnChain(report: Report): Promise<ChainReceipt> {
  const period = calendarMonthPeriod(report);
  if (!period) {
    return {
      status: "skipped",
      network: "none",
      signature: null,
      explorerUrl: null,
      detail: "On-chain submission requires a full calendar month (YYYY-MM-01 through month end). Off-chain receipt still saved.",
    };
  }
  if (!chainConfigured()) {
    return {
      status: "not_submitted",
      network: "none",
      signature: null,
      explorerUrl: null,
      detail: "Solana devnet is not configured. Set SOLANA_PROGRAM_ID, SOLANA_RPC_URL, and a wallet secret.",
    };
  }
  const mockKey = `report:${period}`;
  if (process.env.TALLYTRAIL_CHAIN_MOCK === "memory") {
    if (mockSubmitted.has(mockKey)) throw new DomainError("Duplicate on-chain report rejected for this calendar month and business wallet.", 409);
    mockSubmitted.add(mockKey);
    const signature = createHash("sha256").update(mockKey).digest("hex").slice(0, 88);
    return {
      status: "submitted",
      network: "devnet",
      signature,
      explorerUrl: `https://explorer.solana.com/tx/mock-${signature}?cluster=devnet`,
      detail: `Mock devnet submit_report for ${period}.`,
    };
  }

  const { program, wallet, PublicKey, web3, anchor } = await liveProgram();
  const grams = BigInt(Math.min(Number.MAX_SAFE_INTEGER, Math.round(report.calculation.totalKg * 1000)));
  const [reportPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("report"), wallet.publicKey.toBuffer(), Buffer.from(period)],
    program.programId,
  );
  try {
    const signature = await program.methods
      .submitReport(period, hashBytes(report.hash), new anchor.BN(grams.toString()))
      .accounts({ business: wallet.publicKey, report: reportPda, systemProgram: web3.SystemProgram.programId })
      .rpc();
    return {
      status: "submitted",
      network: "devnet",
      signature,
      explorerUrl: explorerUrl(signature),
      detail: `submit_report recorded for ${period} on devnet.`,
    };
  } catch (error) {
    const message = [String(error), ...((error as { logs?: string[] }).logs || [])].join("\n");
    if (/already in use|already initialized|custom program error/i.test(message)) {
      throw new DomainError("Duplicate on-chain report rejected for this calendar month and business wallet.", 409);
    }
    throw new DomainError(`Solana submission failed: ${error instanceof Error ? error.message : "unknown error"}`, 503);
  }
}

export async function retireOffsetOnChain(registry: string, serial: string, tonnes: number): Promise<ChainReceipt> {
  const serialHash = [...createHash("sha256").update(serial.trim().normalize("NFKC").toUpperCase()).digest()];
  if (!chainConfigured()) {
    return {
      status: "not_submitted",
      network: "none",
      signature: null,
      explorerUrl: null,
      detail: "Solana devnet is not configured for offset retirement.",
    };
  }
  const mockKey = `offset:${serialHash.join("")}`;
  if (process.env.TALLYTRAIL_CHAIN_MOCK === "memory") {
    if (mockSubmitted.has(mockKey)) throw new DomainError("Duplicate on-chain offset retirement rejected.", 409);
    mockSubmitted.add(mockKey);
    const signature = createHash("sha256").update(mockKey).digest("hex").slice(0, 88);
    return {
      status: "submitted",
      network: "devnet",
      signature,
      explorerUrl: `https://explorer.solana.com/tx/mock-${signature}?cluster=devnet`,
      detail: "Mock devnet retire_offset.",
    };
  }
  const { program, wallet, PublicKey, web3, anchor } = await liveProgram();
  const [retirement] = PublicKey.findProgramAddressSync(
    [Buffer.from("offset"), wallet.publicKey.toBuffer(), Buffer.from(serialHash)],
    program.programId,
  );
  const grams = BigInt(Math.min(Number.MAX_SAFE_INTEGER, Math.round(tonnes * 1_000_000)));
  try {
    const signature = await program.methods
      .retireOffset(serialHash, new anchor.BN(grams.toString()), wallet.publicKey)
      .accounts({ registry: wallet.publicKey, retirement, systemProgram: web3.SystemProgram.programId })
      .rpc();
    return {
      status: "submitted",
      network: "devnet",
      signature,
      explorerUrl: explorerUrl(signature),
      detail: "retire_offset recorded on devnet.",
    };
  } catch (error) {
    const message = [String(error), ...((error as { logs?: string[] }).logs || [])].join("\n");
    if (/already in use|already initialized/i.test(message)) {
      throw new DomainError("Duplicate on-chain offset retirement rejected.", 409);
    }
    throw new DomainError(`Solana offset retirement failed: ${error instanceof Error ? error.message : "unknown error"}`, 503);
  }
}

export function resetChainMock(): void {
  mockSubmitted.clear();
}
