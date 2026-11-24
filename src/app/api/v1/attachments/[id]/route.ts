// Staff-only attachment download. Public/anonymous access is never allowed;
// files are streamed from private storage only after session + RBAC checks.
// Bytes come from disk locally or from D1 (AttachmentData) on Cloudflare.

import { fail, handleErrors, ok } from "@/lib/api-response";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { canAccessTicket, getAccessPolicy } from "@/lib/tickets";
import { deleteAttachmentBytes, getAttachmentBytes } from "@/lib/attachment-store";
import { getUserPermissions } from "@/lib/permissions";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  return handleErrors(async () => {
    const { id } = await params;
    const user = await requireUser();

    const attachment = await db.ticketAttachment.findUnique({ where: { id }, include: { ticket: { select: { branchId: true, assignedToId: true } } } });
    if (!attachment) return fail("NOT_FOUND", "Attachment not found.", 404);
    if (!canAccessTicket(user, attachment.ticket, await getAccessPolicy())) return fail("FORBIDDEN", "You do not have access to this attachment.", 403);

    // Path traversal protection: storedName is a server-generated UUID file.
    if (!/^[a-f0-9-]{36}\.bin$/.test(attachment.storedName)) return fail("NOT_FOUND", "Attachment not found.", 404);
    const buffer = await getAttachmentBytes(attachment.storedName);
    if (!buffer) return fail("NOT_FOUND", "Attachment content is missing.", 404);
    return new Response(new Uint8Array(buffer), {
      headers: {
        "content-type": attachment.mimeType || "application/octet-stream",
        "content-disposition": `inline; filename="${attachment.originalName.replace(/"/g, "")}"`,
        "cache-control": "private, no-store",
      },
    });
  });
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  return handleErrors(async () => {
    const { id } = await params;
    const user = await requireUser();
    const permissions = await getUserPermissions(user);
    if (!permissions.manageAttachments) {
      return fail("FORBIDDEN", "Your role or designation does not have permission to delete attachments.", 403);
    }

    const attachment = await db.ticketAttachment.findUnique({
      where: { id },
      include: { ticket: { select: { id: true, branchId: true, assignedToId: true, status: true } } },
    });
    if (!attachment) return fail("NOT_FOUND", "Attachment not found.", 404);
    if (!canAccessTicket(user, attachment.ticket, await getAccessPolicy())) {
      return fail("FORBIDDEN", "You do not have access to delete this attachment.", 403);
    }
    if (attachment.ticket.status === "CLOSED") {
      return fail("TICKET_CLOSED", "Closed tickets are read-only.", 409);
    }

    await db.ticketAttachment.delete({ where: { id } });
    await deleteAttachmentBytes(attachment.storedName);
    return ok({ deleted: true });
  });
}
