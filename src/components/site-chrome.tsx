// Public site header + footer used across customer/client-facing pages.
// Customers never log in: the "Complaint" button is their single entry point
// and offers exactly two options — register or track. Staff use the separate /staff/login link.

import Link from "next/link";
import { ShieldCheck, Search } from "lucide-react";
import Image from "next/image";
import { ComplaintChooser } from "@/components/complaint-chooser";

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-40 border-b border-slate-200 bg-white/95 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4">
        <Link href="/" className="flex items-center gap-2.5" aria-label="Msquare Professionals Client Care home">
          <Image src="/logo.svg" alt="Msquare Professionals logo" width={28} height={28} className="rounded-md" />
          <span className="text-[15px] font-semibold tracking-tight text-[#0a2350]">
            Msquare Professionals <span className="font-normal text-slate-500">Client Care</span>
          </span>
        </Link>
        <nav className="flex items-center gap-2" aria-label="Support navigation">
          <Link
            href="/track"
            className="hidden sm:inline-flex items-center gap-1.5 rounded-md border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 transition hover:bg-slate-50 hover:text-slate-900"
          >
            <Search className="h-3.5 w-3.5 text-slate-400" />
            Track Ticket
          </Link>
          <ComplaintChooser variant="header" />
        </nav>
      </div>
    </header>
  );
}

export function SiteFooter() {
  return (
    <footer className="mt-auto border-t border-slate-200 bg-white">
      <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-2 px-4 py-5 text-sm text-slate-500 sm:flex-row">
        <p className="flex items-center gap-1.5 font-medium text-slate-700">
          <ShieldCheck className="h-4 w-4 text-[#2c6bdf]" aria-hidden />
          Msquare Professionals Client Resolution System
        </p>
        <p className="text-xs text-slate-400">© 2026 Msquare Professionals. Dedicated client satisfaction portal.</p>
      </div>
    </footer>
  );
}
