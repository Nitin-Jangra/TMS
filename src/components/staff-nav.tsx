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
  const dotColor: Record<string, string> = {
    NEW_COMPLAINT: "bg-[#D97706]",
    IN_PROGRESS: "bg-[#D97706]",
    ON_HOLD: "bg-[#7C3AED]",
    RESOLVED: "bg-[#059669]",
    CLOSED: "bg-[#64748B]",
  };
  return (
    <span className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-0.5 text-[11px] font-semibold ring-1 ${STATUS_BADGE_CLASSES[status] || "bg-slate-100 text-slate-600 ring-slate-300"}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${dotColor[status] || "bg-slate-400"}`} aria-hidden />
      {STATUS_LABELS[status] || status}
    </span>
  );
}

export function PriorityBadge({ priority }: { priority: string }) {
  const cls: Record<string, { badge: string; dot: string; label: string }> = {
    CRITICAL: { badge: "bg-[#FEE2E2] text-[#991B1B] ring-[#FECACA]", dot: "bg-[#DC2626]", label: "P1 - Critical" },
    HIGH: { badge: "bg-[#FFF7ED] text-[#C2410C] ring-[#FFEDD5]", dot: "bg-[#EA580C]", label: "P2 - High" },
    MEDIUM: { badge: "bg-[#EFF6FF] text-[#1D4ED8] ring-[#DBEAFE]", dot: "bg-[#2563EB]", label: "P3 - Medium" },
    LOW: { badge: "bg-[#F8FAFC] text-[#475569] ring-[#E2E8F0]", dot: "bg-[#94A3B8]", label: "P4 - Low" },
  };
  const conf = cls[priority] || cls.MEDIUM;
  return (
    <span className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-0.5 text-[11px] font-semibold ring-1 ${conf.badge}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${conf.dot}`} aria-hidden />
      {conf.label}
    </span>
  );
}
