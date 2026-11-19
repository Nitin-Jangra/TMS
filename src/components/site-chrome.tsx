// Public site header + footer styled with ServiceNow Employee Center / Service Portal aesthetics.
// Customers never log in: they self-service via catalog items or ticket tracking.

import Link from "next/link";
import { ShieldCheck, Search, HelpCircle, Layers, ExternalLink } from "lucide-react";
import Image from "next/image";
import { ComplaintChooser } from "@/components/complaint-chooser";

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
          <span className="hidden border-l border-slate-700 pl-3 text-[11px] font-bold tracking-wider text-slate-400 sm:block">
            EMPLOYEE CENTER • SERVICE PORTAL
          </span>
        </Link>

        <nav className="flex items-center gap-2 sm:gap-4 text-xs font-semibold" aria-label="Service Portal Navigation">
          <Link
            href="/complaint"
            className="hidden text-slate-300 transition hover:text-white sm:inline-block"
          >
            Service Catalog
          </Link>

          <Link
            href="/track"
            className="inline-flex items-center gap-1.5 rounded bg-[#101721] px-3 py-1.5 text-slate-200 border border-slate-700 transition hover:border-[#1f70c1] hover:text-white"
          >
            <Search className="h-3.5 w-3.5 text-[#38bdf8]" />
            <span>Track Requests</span>
          </Link>

          <ComplaintChooser variant="header" />
        </nav>
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

        <div className="flex items-center gap-4 text-xs text-slate-400">
          <Link href="/staff-login" className="transition hover:text-white">
            Staff Login
          </Link>
          <span>•</span>
          <Link href="/docs/api" className="transition hover:text-white">
            API Docs
          </Link>
          <span>•</span>
          <span>© {new Date().getFullYear()} FitClass</span>
        </div>
      </div>
    </footer>
  );
}
