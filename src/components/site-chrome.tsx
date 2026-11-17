// Public site header + footer used across customer/client-facing pages.
// Customers never log in: the "Complaint" button is their single entry point
// and offers exactly two options — register or track. Staff use the separate /staff-login portal.

import Link from "next/link";
import { ShieldCheck, Search } from "lucide-react";
import Image from "next/image";
import { ComplaintChooser } from "@/components/complaint-chooser";

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-40 border-b border-[#ffffff14] bg-[#0c0c10]/95 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6">
        <Link href="/" className="flex items-center gap-3 transition hover:opacity-90" aria-label="FitClass Member Care home">
          <Image
            src="/fitclass-logo.webp"
            alt="Fitclass - A Series of Luxury Gyms"
            width={138}
            height={36}
            className="h-9 w-auto object-contain"
            priority
          />
          <span className="hidden border-l border-[#ffffff1f] pl-3 text-[11px] font-semibold tracking-wide text-[#72bdd0] sm:block">
            MEMBER CARE & SUPPORT
          </span>
        </Link>
        <nav className="flex items-center gap-3" aria-label="Support navigation">
          <Link
            href="/track"
            className="hidden sm:inline-flex items-center gap-1.5 rounded-xl border border-[#ffffff1f] bg-[#171722] px-3.5 py-2 text-xs font-semibold text-[#f4f4f7] transition hover:border-[#72bdd0]/40 hover:text-[#72bdd0]"
          >
            <Search className="h-3.5 w-3.5 text-[#72bdd0]" />
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
    <footer className="mt-auto border-t border-[#ffffff14] bg-[#0c0c10] text-[#a1a1aa]">
      <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 px-4 py-8 sm:flex-row sm:px-6">
        <div className="flex items-center gap-3">
          <Image src="/logo.png" alt="FitClass" width={28} height={28} className="rounded object-contain" />
          <div>
            <p className="flex items-center gap-1.5 text-xs font-bold text-white">
              <ShieldCheck className="h-4 w-4 text-[#72bdd0]" aria-hidden />
              FitClass Member Support System
            </p>
            <p className="text-[11px] text-[#71717a]">Dedicated client satisfaction and SLA management platform.</p>
          </div>
        </div>
        <p className="text-xs text-[#71717a]">
          © {new Date().getFullYear()} FitClass. All rights reserved.
        </p>
      </div>
    </footer>
  );
}
