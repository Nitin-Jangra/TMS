// Optional customer attachment upload at complaint registration.
// Private storage: files never live in /public; access requires a staff
// session. Allowed sizes/types are enforced from Root Admin settings.
// Bytes go to disk locally or to D1 (AttachmentData) on Cloudflare Workers —
// see src/lib/attachment-store.ts.

import { fail, handleErrors, ok } from "@/lib/api-response";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import { db } from "@/lib/db";
import { getSettings } from "@/lib/settings";
import { normalizePhone } from "@/lib/types";
import { exceedsStorageLimit, putAttachmentBytes, usesD1AttachmentStorage, D1_BLOB_LIMIT_BYTES } from "@/lib/attachment-store";
import { randomUUID } from "crypto";

export async function POST(request: Request) {
  return handleErrors(async () => {
    const ip = clientIp(request);
    const limit = rateLimit(`upload:${ip}`, 12, 600);
    if (!limit.allowed) return fail("RATE_LIMITED", `Too many uploads. Try again later.`, 429);

    const form = await request.formData();
    const ticketNumber = String(form.get("ticketNumber") || "").trim().toUpperCase();
    const phone = normalizePhone(String(form.get("mobileNumber") || ""));

    // Verify ticket + phone match before accepting any file.
    const ticket = await db.ticket.findUnique({ where: { ticketNumber } });
    if (!ticket || ticket.customerPhone !== phone) {
      return fail("TRACK_NOT_FOUND", "We could not verify that ticket with the provided mobile number.", 404);
    }
    if (ticket.status === "CLOSED") return fail("TICKET_CLOSED", "Closed tickets are read-only.", 409);

    const settings = await getSettings();
    const maxMb = Number(settings.max_upload_mb || "10");
    const allowed = (settings.allowed_upload_types || "").split(",").map((s) => s.trim()).filter(Boolean);

    // Accept single or multiple files from 'files' or 'file' field
    const multiFiles = form.getAll("files");
    const singleFiles = form.getAll("file");
    const rawList = multiFiles.length > 0 ? multiFiles : singleFiles;
    const candidateFiles = rawList.filter(
      (f): f is File => f instanceof File && f.size > 0
    );

    if (candidateFiles.length === 0) {
      return fail("VALIDATION_ERROR", "No valid files provided.", 422);
    }

    if (candidateFiles.length > 10) {
      return fail("TOO_MANY_FILES", "You may upload a maximum of 10 attachments per request.", 422);
    }

    const cappedMb = (D1_BLOB_LIMIT_BYTES / (1024 * 1024)).toFixed(1);
    const createdAttachments: Array<{
      id: string;
      originalName: string;
      sizeBytes: number;
      mimeType: string;
    }> = [];

    // Pre-flight validation on all files before writing to storage
    for (const file of candidateFiles) {
      if (file.size > maxMb * 1024 * 1024) {
        return fail("FILE_TOO_LARGE", `File "${file.name}" exceeds the ${maxMb} MB limit.`, 422);
      }
      if (exceedsStorageLimit(file.size, maxMb)) {
        return fail(
          "FILE_TOO_LARGE",
          `File "${file.name}" exceeds ${cappedMb} MB (database storage row limit).`,
          422
        );
      }
      if (allowed.length > 0 && !allowed.includes(file.type)) {
        return fail("FILE_TYPE_NOT_ALLOWED", `File type "${file.type || "unknown"}" is not permitted for "${file.name}".`, 422);
      }
    }

    // Persist all validated files
    for (const file of candidateFiles) {
      const storedName = `${randomUUID()}.bin`;
      const buffer = Buffer.from(await file.arrayBuffer());
      await putAttachmentBytes(storedName, buffer);

      const attachment = await db.ticketAttachment.create({
        data: {
          ticketId: ticket.id,
          originalName: file.name.slice(0, 200),
          storedName,
          mimeType: file.type || "application/octet-stream",
          sizeBytes: file.size,
        },
      });

      createdAttachments.push({
        id: attachment.id,
        originalName: attachment.originalName,
        sizeBytes: attachment.sizeBytes,
        mimeType: attachment.mimeType,
      });
    }

    return ok(
      {
        count: createdAttachments.length,
        attachments: createdAttachments,
        attachmentId: createdAttachments[0]?.id,
        originalName: createdAttachments[0]?.originalName,
        sizeBytes: createdAttachments[0]?.sizeBytes,
        storage: usesD1AttachmentStorage() ? "d1" : "disk",
      },
      { status: 201 }
    );
  });
}
