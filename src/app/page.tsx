// Customer landing page — no login required. One "Complaint" entry point that
// surfaces exactly two options: Register a complaint / Track a complaint.
// Staff (admin + customer support) sign in via /login instead.

import Link from "next/link";
import { SiteFooter, SiteHeader } from "@/components/site-chrome";
import { ComplaintChooser } from "@/components/complaint-chooser";
import { ClipboardPlus, Search, Clock3, ShieldCheck, BellRing, RefreshCcw } from "lucide-react";

const features = [
  { icon: Clock3, title: "Fast acknowledgement", text: "Your ticket number is generated instantly and our team is notified right away." },
  { icon: RefreshCcw, title: "Reopen within the window", text: "Not satisfied with a resolution? Reopen the same ticket before it closes automatically." },
  { icon: BellRing, title: "Email updates", text: "You receive updates at registration, assignment, hold, resolution and closure." },
  { icon: ShieldCheck, title: "Private by design", text: "Track with your ticket ID and registered mobile number — no account needed." },
];

export default function HomePage() {
  return (
    <div className="flex min-h-screen flex-col">
      <SiteHeader />
      <main className="flex-1">
        {/* Hero with the single "Complaint" entry point */}
        <section className="brand-gradient text-white">
          <div className="mx-auto max-w-6xl px-4 py-14 sm:py-20">
            <p className="mb-3 inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-xs font-medium tracking-wide text-blue-100">
              <span className="inline-block h-1.5 w-1.5 rounded-full bg-emerald-400" aria-hidden />
              FitClass Customer Support Portal
            </p>
            <h1 className="max-w-2xl text-3xl font-bold leading-tight sm:text-4xl">
              How can we help you today?
            </h1>
            <p className="mt-3 max-w-xl text-sm leading-relaxed text-blue-100 sm:text-base">
              No account needed. Click <strong className="font-semibold text-white">Complaint</strong> below and choose
              one of the two options — register a new complaint or track an existing one.
            </p>
            <div className="mt-6">
              <ComplaintChooser variant="hero" />
            </div>
          </div>
        </section>

        {/* The two options, also directly reachable */}
        <section className="mx-auto -mt-8 max-w-6xl px-4 pb-4" aria-label="Support options">
          <div className="grid gap-4 md:grid-cols-2">
            <Link
              href="/complaint"
              className="group brand-ring flex flex-col rounded-xl border border-slate-200 bg-white p-6 transition hover:-translate-y-0.5 hover:border-[#2c6bdf]/40"
            >
              <span className="mb-4 flex h-11 w-11 items-center justify-center rounded-lg bg-[#0a2350] text-white">
                <ClipboardPlus className="h-5 w-5" aria-hidden />
              </span>
              <h2 className="text-lg font-semibold text-[#0a2350]">Register a complaint</h2>
              <p className="mt-1.5 flex-1 text-sm leading-relaxed text-slate-500">
                Facing an issue at your FitClass branch? Tell us what happened and get a unique
                ticket number immediately — no account required.
              </p>
              <span className="mt-4 text-sm font-medium text-[#2c6bdf] group-hover:underline">Start now →</span>
            </Link>
            <Link
              href="/track"
              className="group brand-ring flex flex-col rounded-xl border border-slate-200 bg-white p-6 transition hover:-translate-y-0.5 hover:border-[#2c6bdf]/40"
            >
              <span className="mb-4 flex h-11 w-11 items-center justify-center rounded-lg bg-[#2c6bdf] text-white">
                <Search className="h-5 w-5" aria-hidden />
              </span>
              <h2 className="text-lg font-semibold text-[#0a2350]">Track a complaint</h2>
              <p className="mt-1.5 flex-1 text-sm leading-relaxed text-slate-500">
                Check the live status of your ticket, read updates from the support team, and
                reopen a resolved ticket within the reopening window.
              </p>
              <span className="mt-4 text-sm font-medium text-[#2c6bdf] group-hover:underline">Track now →</span>
            </Link>
          </div>
        </section>

        {/* Features */}
        <section className="mx-auto max-w-6xl px-4 py-10" aria-label="How it works">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {features.map((f) => (
              <div key={f.title} className="rounded-lg border border-slate-200 bg-white p-4">
                <f.icon className="mb-2.5 h-5 w-5 text-[#2c6bdf]" aria-hidden />
                <h3 className="text-sm font-semibold text-[#0a2350]">{f.title}</h3>
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
