// Root Admin system settings. Branch/central notification emails can be set
// here once FitClass provides the official mailboxes (currently blank).
// Every change is audited with previous value, new value, actor, timestamp.

import { handleErrors, ok, fail } from "@/lib/api-response";
import { requireRole } from "@/lib/auth";
import { getSettings, updateSettings } from "@/lib/settings";

const ALLOWED_KEYS = [
  "central_support_email",
  "ticket_id_prefix",
  "reopen_window_hours",
  "auto_closure_enabled",
  "maintenance_mode",
  "max_upload_mb",
  "allowed_upload_types",
  "notification_customer_enabled",
  "notification_branch_enabled",
  "notification_central_enabled",
];

export async function GET() {
  return handleErrors(async () => {
    await requireRole(["ROOT_ADMIN"]);
    const settings = await getSettings();
    return ok({ settings });
  });
}

export async function PUT(request: Request) {
  return handleErrors(async () => {
    const user = await requireRole(["ROOT_ADMIN"]);
    const body = await request.json().catch(() => null);
    const incoming = (body as { settings?: Record<string, string>; reason?: string })?.settings || {};
    const reason = String((body as { reason?: string })?.reason || "");

    const changes = Object.entries(incoming)
      .filter(([key]) => ALLOWED_KEYS.includes(key))
      .map(([key, value]) => ({ key, value: String(value ?? ""), reason }));

    if (!changes.length) return fail("VALIDATION_ERROR", "No valid settings provided.", 422);
    await updateSettings(changes, { id: user.id, name: user.name });
    const settings = await getSettings();
    return ok({ settings });
  });
}
