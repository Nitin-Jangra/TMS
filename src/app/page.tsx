// FitClass Client Landing Page — no login required.
// Single "Complaint" entry point for FitClass website clients:
// surfaces exactly two options: Register a complaint / Track a complaint.
// Staff sign in via their separate internal URL (/staff-login).

import Link from "next/link";
import { SiteFooter, SiteHeader } from "@/components/site-chrome";
import { ComplaintChooser } from "@/components/complaint-chooser";
import { ClipboardPlus, Search, Clock3, ShieldCheck, BellRing, RefreshCcw } from "lucide-react";

const features = [
  { icon: Clock3, title: "Fast Acknowledgement", text: "Your unique ticket number is generated instantly and routed to the support team at your FitClass branch." },
  { icon: RefreshCcw, title: "72-Hour Review Window", text: "Not satisfied with a resolution? Reopen the same ticket before it closes automatically." },
  { icon: BellRing, title: "Live Email Updates", text: "You receive real-time email notifications at registration, assignment, and resolution." },
  { icon: ShieldCheck, title: "Secure & Private", text: "Track directly with your ticket ID and registered mobile number — zero password needed." },
];

export default function HomePage() {
  return (
    <div className="flex min-h-screen flex-col bg-[#0c0c10] text-[#f4f4f7] selection:bg-[#22618b]/30 selection:text-white">
      <SiteHeader />
      <main className="flex-1">
        {/* Hero Section */}
        <section className="relative overflow-hidden border-b border-[#ffffff14] bg-gradient-to-b from-[#13131a] via-[#0c0c10] to-[#0c0c10] py-16 sm:py-24">
          {/* Subtle Ambient Glow */}
          <div className="pointer-events-none absolute -top-24 left-1/2 -z-0 h-96 w-96 -translate-x-1/2 rounded-full bg-[#22618b]/15 blur-3xl" />
          
          <div className="relative z-10 mx-auto max-w-6xl px-4 sm:px-6">
            <div className="inline-flex items-center gap-2 rounded-full border border-[rgba(114, 189, 208,0.3)] bg-[rgba(114, 189, 208,0.08)] px-4 py-1.5 text-xs font-bold tracking-wide text-[#72bdd0]">
              <span className="inline-block h-2 w-2 rounded-full bg-[#22618b] animate-pulse" aria-hidden />
              FITCLASS • MEMBER CARE PORTAL
            </div>
            <h1 className="mt-5 max-w-3xl text-3xl font-extrabold leading-tight tracking-tight text-white sm:text-5xl lg:text-6xl">
              Member Support & <span className="text-transparent bg-clip-text bg-gradient-to-r from-[#72bdd0] to-[#22618b]">Resolution Center</span>
            </h1>
            <p className="mt-4 max-w-2xl text-sm leading-relaxed text-[#a1a1aa] sm:text-base">
              Facing an issue at your FitClass gym — equipment, trainers, billing, membership or cleanliness? Click <strong className="font-bold text-white">Complaint</strong> below to register a ticket or track real-time resolution progress.
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-4">
              <ComplaintChooser variant="hero" />
              <Link
                href="/track"
                className="inline-flex items-center gap-2 rounded-xl border border-[#ffffff1f] bg-[#171722] px-6 py-3.5 text-sm font-bold text-[#f4f4f7] transition hover:border-[#72bdd0]/40 hover:bg-[#1c1c28] hover:text-[#72bdd0]"
              >
                <Search className="h-4 w-4 text-[#72bdd0]" />
                Track Existing Ticket
              </Link>
            </div>
          </div>
        </section>

        {/* The Two Member Options */}
        <section className="relative z-20 mx-auto -mt-6 max-w-6xl px-4 pb-6 sm:px-6" aria-label="Support options">
          <div className="grid gap-5 md:grid-cols-2">
            <Link
              href="/complaint"
              className="group flex flex-col rounded-2xl border border-[#ffffff14] bg-[#13131a] p-7 shadow-xl transition duration-200 hover:-translate-y-1 hover:border-[#72bdd0]/50 hover:shadow-2xl"
            >
              <span className="mb-5 flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-[#22618b] to-[#1a4c6e] text-white shadow-md">
                <ClipboardPlus className="h-6 w-6" aria-hidden />
              </span>
              <h2 className="text-xl font-extrabold text-white group-hover:text-[#72bdd0] transition">
                Register a complaint
              </h2>
              <p className="mt-2 flex-1 text-xs leading-relaxed text-[#a1a1aa] sm:text-sm">
                Submit your concern directly to the support team at your branch. You will receive an immediate ticket reference number and automatic email confirmation.
              </p>
              <span className="mt-5 inline-flex items-center gap-1.5 text-xs font-bold text-[#72bdd0] group-hover:underline">
                Submit Complaint →
              </span>
            </Link>

            <Link
              href="/track"
              className="group flex flex-col rounded-2xl border border-[#ffffff14] bg-[#13131a] p-7 shadow-xl transition duration-200 hover:-translate-y-1 hover:border-[#3b82f6]/50 hover:shadow-2xl"
            >
              <span className="mb-5 flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-[#2563eb] to-[#1d4ed8] text-white shadow-md">
                <Search className="h-6 w-6" aria-hidden />
              </span>
              <h2 className="text-xl font-extrabold text-white group-hover:text-[#3b82f6] transition">
                Track a complaint
              </h2>
              <p className="mt-2 flex-1 text-xs leading-relaxed text-[#a1a1aa] sm:text-sm">
                Check the live status of your ticket, view assigned support personnel, review resolution notes, or reopen a ticket within the 72-hour window.
              </p>
              <span className="mt-5 inline-flex items-center gap-1.5 text-xs font-bold text-[#3b82f6] group-hover:underline">
                Check Live Status →
              </span>
            </Link>
          </div>
        </section>

        {/* Features / Assurance */}
        <section className="mx-auto max-w-6xl px-4 py-16 sm:px-6" aria-label="Our commitment">
          <div className="mb-8 text-center sm:text-left">
            <span className="text-xs font-bold uppercase tracking-wider text-[#72bdd0]">The FitClass Promise</span>
            <h2 className="mt-1 text-2xl font-extrabold text-white">Our Resolution Standard</h2>
            <p className="mt-1 text-xs text-[#a1a1aa]">Dedicated SLA-driven workflows to resolve every member concern.</p>
          </div>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {features.map((f) => (
              <div key={f.title} className="rounded-2xl border border-[#ffffff14] bg-[#13131a] p-5 shadow-sm transition hover:border-[#ffffff24]">
                <f.icon className="mb-3 h-5 w-5 text-[#72bdd0]" aria-hidden />
                <h3 className="text-sm font-bold text-white">{f.title}</h3>
                <p className="mt-1 text-xs leading-relaxed text-[#a1a1aa]">{f.text}</p>
              </div>
            ))}
          </div>
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}
