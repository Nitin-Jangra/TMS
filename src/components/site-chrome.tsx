// Public site header + footer styled with ServiceNow Employee Center / Service Portal aesthetics.
// Customers never log in: they self-service via catalog items or ticket tracking.

import Link from "next/link";
import { ShieldCheck } from "lucide-react";
import Image from "next/image";

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-40 border-b border-[#2a374a] bg-[#161f28] text-white shadow-sm">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4 sm:px-6">
        <Link href="/" className="flex items-center gap-3 transition hover:opacity-95" aria-label="FitClass Service Portal">
          <Image
            src="/fitclass-logo.webp"
            alt="Fitclass"
            width={130}
            height={34}
            className="h-8 w-auto object-contain"
            priority
          />
        </Link>
      </div>
    </header>
  );
}

export function SiteFooter() {
  return (
    <footer className="mt-auto border-t border-[#2a374a] bg-[#161f28] text-slate-400 text-xs">
      <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 px-4 py-8 sm:flex-row sm:px-6">
        <div className="flex items-center gap-3">
          <Image src="/logo.png" alt="FitClass Logo" width={28} height={28} className="rounded object-contain" />
          <div>
            <p className="flex items-center gap-1.5 text-xs font-bold text-white">
              <ShieldCheck className="h-4 w-4 text-[#30c497]" aria-hidden />
              FitClass Service Management Platform
            </p>
            <p className="text-[11px] text-slate-400">ITIL-compliant Resolution & SLA Tracking System across 34 branches.</p>
          </div>
        </div>

        <div className="flex items-center text-xs text-slate-400">
          <span>© {new Date().getFullYear()} FitClass</span>
        </div>
      </div>
    </footer>
  );
}
