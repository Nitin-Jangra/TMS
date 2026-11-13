// Optional customer attachment upload at complaint registration.
// Private storage: files never live in /public; access requires a staff
// session. Allowsizes/types are enforced from Root Admin settings.

import { fail, handleErrors, ok } from "@/lib/api-response";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import { db } from "@/lib/db";
import { getSettings } from "@/lib/settings";
import { normalizePhone } from "@/lib/types";
import { mkdir, writeFile } from "fs/promises";
import { randomUUID } from "crypto";
import path from "path";

const UPLOAD_DIR = path.join(process.cwd(), "db", "uploads");

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
    const allowed = (settings.allowed_upload_types || "").split(",").map((s) => s.trim());

    const file = form.get("file");
    if (!(file instanceof File)) return fail("VALIDATION_ERROR", "No file provided.", 422);
    if (file.size > maxMb * 1024 * 1024) return fail("FILE_TOO_LARGE", `File exceeds the ${maxMb} MB limit.`, 422);
    if (!allowed.includes(file.type)) return fail("FILE_TYPE_NOT_ALLOWED", `File type ${file.type || "unknown"} is not allowed.`, 422);

    // Random server-generated filename; original name kept for display only.
    const storedName = `${randomUUID()}.bin`;
    await mkdir(UPLOAD_DIR, { recursive: true });
    const buffer = Buffer.from(await file.arrayBuffer());
    await writeFile(path.join(UPLOAD_DIR, storedName), buffer);

    const attachment = await db.ticketAttachment.create({
      data: {
        ticketId: ticket.id,
        originalName: file.name.slice(0, 200),
        storedName,
        mimeType: file.type,
        sizeBytes: file.size,
      },
    });

    return ok({ attachmentId: attachment.id, originalName: attachment.originalName, sizeBytes: attachment.sizeBytes }, { status: 201 });
  });
}
