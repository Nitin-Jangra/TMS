// Public site header + sticky footer used across customer-facing pages.
// Customers never log in: the "Complaint" button is their single entry point
// and offers exactly two options — register or track. Staff use "Staff login".

import Link from "next/link";
import { ShieldCheck, LayoutDashboard } from "lucide-react";
import Image from "next/image";
import { ComplaintChooser } from "@/components/complaint-chooser";

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-40 border-b border-slate-200 bg-white/95 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4">
        <Link href="/" className="flex items-center gap-2.5" aria-label="FitClass support home">
          <Image src="/logo.svg" alt="FitClass logo" width={28} height={28} className="rounded-md" />
          <span className="text-[15px] font-semibold tracking-tight text-[#0a2350]">
            FitClass <span className="font-normal text-slate-500">Support</span>
          </span>
        </Link>
        <nav className="flex items-center gap-1.5" aria-label="Support navigation">
          <ComplaintChooser variant="header" />
          <Link
            href="/login"
            className="flex items-center gap-1.5 rounded-md bg-[#0a2350] px-3.5 py-1.5 text-sm font-medium text-white hover:bg-[#10306b]"
          >
            <LayoutDashboard className="h-4 w-4" aria-hidden />
            Staff Login
          </Link>
        </nav>
      </div>
    </header>
  );
}

export function SiteFooter() {
  return (
    <footer className="mt-auto border-t border-slate-200 bg-white">
      <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-2 px-4 py-5 text-sm text-slate-500 sm:flex-row">
        <p className="flex items-center gap-1.5">
          <ShieldCheck className="h-4 w-4 text-[#2c6bdf]" aria-hidden />
          FitClass Complaint Management System
        </p>
        <p>Development environment with dummy data. No real customer records.</p>
      </div>
    </footer>
  );
}
