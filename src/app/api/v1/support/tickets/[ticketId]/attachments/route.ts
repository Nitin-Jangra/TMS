// Staff attachment upload for an existing ticket.
// Allows authorized staff to upload files to an open ticket.

import { fail, handleErrors, ok } from "@/lib/api-response";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { canAccessTicket, getAccessPolicy } from "@/lib/tickets";
import { getSettings } from "@/lib/settings";
import { exceedsStorageLimit, putAttachmentBytes, D1_BLOB_LIMIT_BYTES } from "@/lib/attachment-store";
import { getUserPermissions } from "@/lib/permissions";
import { randomUUID } from "crypto";

export async function POST(request: Request, { params }: { params: Promise<{ ticketId: string }> }) {
  return handleErrors(async () => {
    const { ticketId } = await params;
    const user = await requireUser();
    const permissions = await getUserPermissions(user);
    if (!permissions.manageAttachments) {
      return fail("FORBIDDEN", "Your role or designation does not have permission to manage attachments.", 403);
    }

    const ticket = await db.ticket.findUnique({
      where: { id: ticketId },
      select: { id: true, branchId: true, assignedToId: true, status: true },
    });
    if (!ticket) return fail("NOT_FOUND", "Ticket not found.", 404);
    if (!canAccessTicket(user, ticket, await getAccessPolicy())) {
      return fail("FORBIDDEN", "You do not have access to this ticket.", 403);
    }
    if (ticket.status === "CLOSED") {
      return fail("TICKET_CLOSED", "Closed tickets are read-only.", 409);
    }

    const form = await request.formData();
    const multiFiles = form.getAll("files");
    const singleFiles = form.getAll("file");
    const rawList = multiFiles.length > 0 ? multiFiles : singleFiles;
    const candidateFiles = rawList.filter((f): f is File => f instanceof File && f.size > 0);

    if (candidateFiles.length === 0) {
      return fail("VALIDATION_ERROR", "No valid files provided.", 422);
    }

    const settings = await getSettings();
    const maxMb = Number(settings.max_upload_mb || "10");
    const allowed = (settings.allowed_upload_types || "").split(",").map((s) => s.trim()).filter(Boolean);

    for (const file of candidateFiles) {
      if (file.size > maxMb * 1024 * 1024) {
        return fail("FILE_TOO_LARGE", `File "${file.name}" exceeds the ${maxMb} MB limit.`, 422);
      }
      if (exceedsStorageLimit(file.size, maxMb)) {
        return fail("FILE_TOO_LARGE", `File "${file.name}" exceeds storage limit.`, 422);
      }
      if (allowed.length > 0 && !allowed.includes(file.type)) {
        return fail("FILE_TYPE_NOT_ALLOWED", `File type "${file.type || "unknown"}" is not permitted for "${file.name}".`, 422);
      }
    }

    const createdAttachments: Array<{
      id: string;
      originalName: string;
      sizeBytes: number;
      mimeType: string;
    }> = [];

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

    return ok({ count: createdAttachments.length, attachments: createdAttachments }, { status: 201 });
  });
}
