"use client";

// Shared client bits for the staff shell: logout button + status/priority badges.

import { useRouter } from "next/navigation";
import { useState } from "react";
import { LogOut } from "lucide-react";
import { STATUS_BADGE_CLASSES, STATUS_LABELS, PRIORITY_LABELS } from "@/lib/types";

export function LogoutButton() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  return (
    <button
      type="button"
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        await fetch("/api/v1/auth/logout", { method: "POST" }).catch(() => undefined);
        router.push("/login");
        router.refresh();
      }}
      className="mt-3 flex w-full items-center justify-center gap-1.5 rounded-md border border-white/20 px-3 py-1.5 text-xs font-medium text-blue-100 transition hover:bg-white/10 disabled:opacity-60"
    >
      <LogOut className="h-3.5 w-3.5" aria-hidden />
      {busy ? "Signing out..." : "Sign out"}
    </button>
  );
}

export function StatusBadge({ status }: { status: string }) {
  return (
    <span className={`inline-flex items-center whitespace-nowrap rounded-full px-2.5 py-0.5 text-[11px] font-semibold ring-1 ${STATUS_BADGE_CLASSES[status] || "bg-slate-100 text-slate-600 ring-slate-300"}`}>
      {STATUS_LABELS[status] || status}
    </span>
  );
}

export function PriorityBadge({ priority }: { priority: string }) {
  const cls: Record<string, string> = {
    CRITICAL: "bg-red-50 text-red-700 ring-red-200",
    HIGH: "bg-orange-50 text-orange-700 ring-orange-200",
    MEDIUM: "bg-slate-50 text-slate-600 ring-slate-300",
    LOW: "bg-slate-50 text-slate-400 ring-slate-200",
  };
  return (
    <span className={`inline-flex items-center whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ${cls[priority] || cls.MEDIUM}`}>
      {PRIORITY_LABELS[priority] || priority}
    </span>
  );
}
