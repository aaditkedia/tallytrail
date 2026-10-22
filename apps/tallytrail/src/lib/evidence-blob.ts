import "server-only";
import { put, del } from "@vercel/blob";
import { eq } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { DomainError } from "./errors";
import type { EvidenceMetadata } from "./evidence";

export async function storeHostedEvidence(ownerId: string, meta: EvidenceMetadata, bytes: Buffer): Promise<EvidenceMetadata> {
  const token = process.env.BLOB_READ_WRITE_TOKEN?.trim();
  if (!token) throw new DomainError("Hosted bill storage requires BLOB_READ_WRITE_TOKEN.", 503);
  const blob = await put(`tallytrail/${ownerId}/${meta.id}`, bytes, { access: "private", token, contentType: meta.mime });
  const db = getDb();
  await db.insert(schema.evidenceFiles).values({
    id: meta.id,
    ownerId,
    sha256: meta.sha256,
    mime: meta.mime,
    bytes: meta.bytes,
    storedAt: new Date(meta.storedAt),
    blobUrl: blob.url,
  });
  return meta;
}

export async function loadHostedEvidence(ownerId: string, id: string): Promise<{ meta: EvidenceMetadata; bytes: Buffer }> {
  const db = getDb();
  const [row] = await db.select().from(schema.evidenceFiles).where(eq(schema.evidenceFiles.id, id)).limit(1);
  if (!row || row.ownerId !== ownerId) throw new DomainError("Evidence not found", 404);
  if (!row.blobUrl) throw new DomainError("Evidence blob URL missing", 503);
  const response = await fetch(row.blobUrl);
  if (!response.ok) throw new DomainError("Evidence download failed", 503);
  const bytes = Buffer.from(await response.arrayBuffer());
  const meta: EvidenceMetadata = {
    id: row.id,
    sha256: row.sha256,
    mime: row.mime as EvidenceMetadata["mime"],
    bytes: row.bytes,
    storedAt: row.storedAt.toISOString(),
  };
  return { meta, bytes };
}

export async function deleteHostedEvidence(ownerId: string, id: string): Promise<void> {
  const db = getDb();
  const [row] = await db.select().from(schema.evidenceFiles).where(eq(schema.evidenceFiles.id, id)).limit(1);
  if (!row || row.ownerId !== ownerId) throw new DomainError("Evidence not found", 404);
  if (row.blobUrl) await del(row.blobUrl, { token: process.env.BLOB_READ_WRITE_TOKEN! });
  await db.delete(schema.evidenceFiles).where(eq(schema.evidenceFiles.id, id));
}

export async function listHostedEvidence(ownerId: string) {
  const db = getDb();
  const rows = await db.select().from(schema.evidenceFiles).where(eq(schema.evidenceFiles.ownerId, ownerId));
  return rows.map(row => ({
    id: row.id,
    metadata: {
      id: row.id,
      sha256: row.sha256,
      mime: row.mime as EvidenceMetadata["mime"],
      bytes: row.bytes,
      storedAt: row.storedAt.toISOString(),
    },
    available: Boolean(row.blobUrl),
  }));
}
