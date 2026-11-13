// Attachment binary storage with two interchangeable backends:
//   1. Local development (Node.js): files on disk under db/uploads/ — same
//      behaviour as before the Cloudflare migration.
//   2. Cloudflare Workers: bytes in D1 via the AttachmentData table (SQLite
//      BLOB, hard 2 MB per-row limit on D1). Workers have no writable
//      filesystem, so disk storage is impossible there.
// Both backends serve the same API; the routes only switch the upload size
// cap when running on D1.

import { getCloudflareContext } from "@opennextjs/cloudflare";
import { db } from "@/lib/db";
import { mkdir, writeFile } from "fs/promises";
import { readFile } from "fs/promises";
import path from "path";

const UPLOAD_DIR = path.join(process.cwd(), "db", "uploads");

// D1 hard limits: 2,000,000 bytes per row / stored blob. Keep headroom.
export const D1_BLOB_LIMIT_BYTES = 1_900_000;

const onCloudflareWorkers =
  typeof navigator !== "undefined" && navigator.userAgent === "Cloudflare-Workers";

export function usesD1AttachmentStorage(): boolean {
  return onCloudflareWorkers;
}

export async function putAttachmentBytes(id: string, buffer: Buffer): Promise<void> {
  if (onCloudflareWorkers) {
    await db.attachmentData.upsert({
      where: { id },
      create: { id, content: buffer },
      update: { content: buffer },
    });
    return;
  }
  await mkdir(UPLOAD_DIR, { recursive: true });
  await writeFile(path.join(UPLOAD_DIR, id), buffer);
}

export async function getAttachmentBytes(id: string): Promise<Buffer | null> {
  if (onCloudflareWorkers) {
    const row = await db.attachmentData.findUnique({ where: { id } });
    return row ? Buffer.from(row.content) : null;
  }
  try {
    return await readFile(path.join(UPLOAD_DIR, id));
  } catch {
    return null;
  }
}

/** Guard so the D1 backend never receives a row it cannot physically store. */
export function exceedsStorageLimit(sizeBytes: number, configuredMaxMb: number): boolean {
  const configuredBytes = configuredMaxMb * 1024 * 1024;
  const effective = onCloudflareWorkers ? Math.min(configuredBytes, D1_BLOB_LIMIT_BYTES) : configuredBytes;
  return sizeBytes > effective;
}
