// Root Admin system settings. Branch/central notification emails can be set
// here once FitClass provides the official mailboxes (currently blank).
// Every change is audited with previous value, new value, actor, timestamp.

import { handleErrors, ok, fail } from "@/lib/api-response";
import { requireRole } from "@/lib/auth";
import { getSettings, updateSettings } from "@/lib/settings";
import { getPermissionsMatrix, savePermissionsMatrix } from "@/lib/permissions";

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
  "webhook_url",
  "staff_cross_branch_access",
  "support_agent_branch_overview",
  "agents_can_reassign",
  "assignment_strategy",
  "auto_handover_on_leave",
  "escalation_enabled",
  "escalation_warn_percent",
  "escalation_critical_percent",
  "digest_enabled",
  "digest_hour",
  "feedback_enabled",
  "public_base_url",
  "webhook_secret",
];

export async function GET() {
  return handleErrors(async () => {
    await requireRole(["ROOT_ADMIN"]);
    const [settings, matrix] = await Promise.all([getSettings(), getPermissionsMatrix()]);
    return ok({
      settings: {
        ...settings,
        staff_cross_branch_access: String(Boolean(matrix.SUPPORT_AGENT?.viewCrossBranchTickets)),
        support_agent_branch_overview: String(Boolean(matrix.SUPPORT_AGENT?.viewAllBranchTickets)),
      },
    });
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

    // Keep Permissions Matrix synchronized with the General feature switches
    const hasCrossBranchChange = "staff_cross_branch_access" in incoming;
    const hasBranchOverviewChange = "support_agent_branch_overview" in incoming;
    if (hasCrossBranchChange || hasBranchOverviewChange) {
      const matrix = await getPermissionsMatrix();
      if (hasCrossBranchChange) {
        const allowCross = incoming.staff_cross_branch_access === "true";
        for (const roleKey of ["SUPPORT_AGENT", "BRANCH_MANAGER", "Senior Support Agent", "Junior Support Agent"]) {
          if (matrix[roleKey]) {
            matrix[roleKey] = { ...matrix[roleKey], viewCrossBranchTickets: allowCross };
          }
        }
      }
      if (hasBranchOverviewChange && matrix.SUPPORT_AGENT) {
        matrix.SUPPORT_AGENT = {
          ...matrix.SUPPORT_AGENT,
          viewAllBranchTickets: incoming.support_agent_branch_overview === "true",
        };
      }
      await savePermissionsMatrix(matrix, { id: user.id, name: user.name }, reason || "Synced access toggles from general settings");
    }

    const [settings, matrix] = await Promise.all([getSettings(), getPermissionsMatrix()]);
    return ok({
      settings: {
        ...settings,
        staff_cross_branch_access: String(Boolean(matrix.SUPPORT_AGENT?.viewCrossBranchTickets)),
        support_agent_branch_overview: String(Boolean(matrix.SUPPORT_AGENT?.viewAllBranchTickets)),
      },
    });
  });
}
