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
};

export async function getSetting(key: string): Promise<string> {
  const row = await db.systemSetting.findUnique({ where: { key } });
  return row ? row.value : (SETTING_DEFAULTS[key] ?? "");
}

export async function getSettings(): Promise<Record<string, string>> {
  const rows = await db.systemSetting.findMany();
  const out: Record<string, string> = { ...SETTING_DEFAULTS };
  for (const row of rows) out[row.key] = row.value;
  return out;
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
