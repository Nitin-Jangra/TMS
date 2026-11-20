// System configuration module. All settings are audited (previous value,
// new value, changed by, timestamp, reason). Branch/central notification
// emails intentionally start BLANK until FitClass supplies the real mailboxes.

import { db } from "@/lib/db";

export const SETTING_DEFAULTS: Record<string, string> = {
  central_support_email: "",
  ticket_id_prefix: "FC",
  reopen_window_hours: "72", // configurable reopening window (auto-close after this)
  auto_closure_enabled: "true",
  maintenance_mode: "false",
  max_upload_mb: "10",
  allowed_upload_types: "image/png,image/jpeg,image/webp,application/pdf",
  notification_customer_enabled: "true",
  notification_branch_enabled: "true",
  notification_central_enabled: "true",
  webhook_url: "", // LMS endpoint that receives ticket events (blank = disabled)
  webhook_secret: "", // HMAC secret used to sign webhook deliveries
  staff_cross_branch_access: "true", // branch staff can find/view/work tickets of every branch
  agents_can_reassign: "true", // support agents can reassign / transfer tickets
  assignment_strategy: "least_busy", // least_busy | round_robin
  auto_handover_on_leave: "true", // marking someone away hands their open tickets to colleagues
  escalation_enabled: "true", // SLA escalation ladder (warning → breach → critical)
  escalation_warn_percent: "75", // % of the resolution time used before the assignee is reminded
  escalation_critical_percent: "150", // % at which central support + department are alerted
  digest_enabled: "true", // daily summary email to branch managers + central support
  digest_hour: "9", // hour of day (India time) to send the digest
  digest_last_sent: "", // internal: date (YYYY-MM-DD, IST) of the last digest
  feedback_enabled: "true", // ask members to rate the support after resolution
  public_base_url: "", // e.g. https://support.fitclass.in — used for links in emails
};

let settingsCache: { data: Record<string, string>; expires: number } | null = null;

export function invalidateSettingsCache() {
  settingsCache = null;
}

export async function getSettings(): Promise<Record<string, string>> {
  const now = Date.now();
  if (settingsCache && now < settingsCache.expires) {
    return settingsCache.data;
  }
  const rows = await db.systemSetting.findMany();
  const out: Record<string, string> = { ...SETTING_DEFAULTS };
  for (const row of rows) out[row.key] = row.value;
  settingsCache = { data: out, expires: now + 60000 };
  return out;
}

export async function getSetting(key: string): Promise<string> {
  const all = await getSettings();
  return all[key] ?? (SETTING_DEFAULTS[key] ?? "");
}

export interface SettingChange {
  key: string;
  value: string;
  reason?: string;
}

export async function updateSettings(
  changes: SettingChange[],
  actor: { id?: string; name: string } | null,
): Promise<void> {
  for (const change of changes) {
    const previous = await getSetting(change.key);
    await db.systemSetting.upsert({
      where: { key: change.key },
      create: { key: change.key, value: change.value },
      update: { value: change.value, updatedById: actor?.id ?? null },
    });
    if (previous !== change.value) {
      await db.configAudit.create({
        data: {
          settingKey: change.key,
          previousValue: previous,
          newValue: change.value,
          changedById: actor?.id ?? null,
          changedByName: actor?.name || "System",
          reason: change.reason || "",
        },
      });
    }
  }
  invalidateSettingsCache();
}

/** Reopening window in hours (Root Admin configurable; never hardcoded). */
export async function getReopenWindowHours(): Promise<number> {
  const raw = await getSetting("reopen_window_hours");
  const hours = Number(raw);
  return Number.isFinite(hours) && hours > 0 ? hours : 72;
}

export async function isAutoClosureEnabled(): Promise<boolean> {
  return (await getSetting("auto_closure_enabled")) === "true";
}
