// Msquare Professionals Client Landing Page — no login required.
// Single "Complaint" entry point for Msquare website clients:
// surfaces exactly two options: Register a complaint / Track a complaint.
// Staff sign in via their separate internal URL (/staff/login).

import Link from "next/link";
import { SiteFooter, SiteHeader } from "@/components/site-chrome";
import { ComplaintChooser } from "@/components/complaint-chooser";
import { ClipboardPlus, Search, Clock3, ShieldCheck, BellRing, RefreshCcw, CheckCircle2 } from "lucide-react";

const features = [
  { icon: Clock3, title: "Fast Acknowledgement", text: "Your ticket number is generated instantly and routed to the designated account manager." },
  { icon: RefreshCcw, title: "72-Hour Review Window", text: "Not satisfied with a resolution? Reopen the same ticket before it closes automatically." },
  { icon: BellRing, title: "Live Email Updates", text: "You receive real-time email notifications at registration, assignment, and resolution." },
  { icon: ShieldCheck, title: "Secure & Private", text: "Track directly with your ticket ID and registered contact — no account credentials required." },
];

export default function HomePage() {
  return (
    <div className="flex min-h-screen flex-col">
      <SiteHeader />
      <main className="flex-1">
        {/* Hero Section */}
        <section className="brand-gradient text-white">
          <div className="mx-auto max-w-6xl px-4 py-14 sm:py-20">
            <p className="mb-3 inline-flex items-center gap-2 rounded-full bg-white/10 px-3.5 py-1 text-xs font-semibold tracking-wide text-blue-100">
              <span className="inline-block h-2 w-2 rounded-full bg-emerald-400" aria-hidden />
              Msquare Professionals • Client Care Portal
            </p>
            <h1 className="max-w-2xl text-3xl font-extrabold leading-tight tracking-tight sm:text-4xl lg:text-5xl">
              Client Support & Resolution Center
            </h1>
            <p className="mt-3.5 max-w-xl text-sm leading-relaxed text-blue-100 sm:text-base">
              Experiencing an issue with your project, delivery, or service? Click <strong className="font-semibold text-white">Complaint</strong> below to register a ticket or track real-time resolution progress.
            </p>
            <div className="mt-7 flex flex-wrap items-center gap-3">
              <ComplaintChooser variant="hero" />
              <Link
                href="/track"
                className="inline-flex items-center gap-2 rounded-lg border border-white/20 bg-white/10 px-5 py-3.5 text-base font-semibold text-white backdrop-blur transition hover:bg-white/20"
              >
                <Search className="h-4 w-4" />
                Track Existing Ticket
              </Link>
            </div>
          </div>
        </section>

        {/* The Two Client Options */}
        <section className="mx-auto -mt-8 max-w-6xl px-4 pb-4" aria-label="Support options">
          <div className="grid gap-4 md:grid-cols-2">
            <Link
              href="/complaint"
              className="group brand-ring flex flex-col rounded-xl border border-slate-200 bg-white p-6 shadow-sm transition hover:-translate-y-0.5 hover:border-[#2c6bdf]/40 hover:shadow-md"
            >
              <span className="mb-4 flex h-11 w-11 items-center justify-center rounded-lg bg-[#0a2350] text-white">
                <ClipboardPlus className="h-5 w-5" aria-hidden />
              </span>
              <h2 className="text-lg font-bold text-[#0a2350]">Register a complaint</h2>
              <p className="mt-1.5 flex-1 text-sm leading-relaxed text-slate-500">
                Submit your concern directly to our service management team. You will receive an immediate ticket reference number and automatic email confirmation.
              </p>
              <span className="mt-4 inline-flex items-center gap-1 text-sm font-semibold text-[#2c6bdf] group-hover:underline">
                Submit Complaint →
              </span>
            </Link>

            <Link
              href="/track"
              className="group brand-ring flex flex-col rounded-xl border border-slate-200 bg-white p-6 shadow-sm transition hover:-translate-y-0.5 hover:border-[#2c6bdf]/40 hover:shadow-md"
            >
              <span className="mb-4 flex h-11 w-11 items-center justify-center rounded-lg bg-[#2c6bdf] text-white">
                <Search className="h-5 w-5" aria-hidden />
              </span>
              <h2 className="text-lg font-bold text-[#0a2350]">Track a complaint</h2>
              <p className="mt-1.5 flex-1 text-sm leading-relaxed text-slate-500">
                Check the live status of your ticket, view assigned support personnel, review resolution notes, or reopen a ticket within the 72-hour window.
              </p>
              <span className="mt-4 inline-flex items-center gap-1 text-sm font-semibold text-[#2c6bdf] group-hover:underline">
                Check Live Status →
              </span>
            </Link>
          </div>
        </section>

        {/* Features / Assurance */}
        <section className="mx-auto max-w-6xl px-4 py-12" aria-label="Our commitment">
          <div className="mb-6 text-center sm:text-left">
            <h2 className="text-lg font-bold text-[#0a2350]">Our Resolution Guarantee</h2>
            <p className="text-xs text-slate-500">Dedicated SLA-driven workflows to resolve every client concern.</p>
          </div>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {features.map((f) => (
              <div key={f.title} className="rounded-xl border border-slate-200/80 bg-white p-4.5 shadow-xs">
                <f.icon className="mb-2.5 h-5 w-5 text-[#2c6bdf]" aria-hidden />
                <h3 className="text-sm font-bold text-[#0a2350]">{f.title}</h3>
                <p className="mt-1 text-xs leading-relaxed text-slate-500">{f.text}</p>
              </div>
            ))}
          </div>
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}
