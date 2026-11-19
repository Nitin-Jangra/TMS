// FitClass Service Portal (Employee Center Style) — ServiceNow Inspired.
// Self-service entry point for gym members across 34 branches.
// Zero login required for customers: lodge complaints or track resolution live.

import Link from "next/link";
import { SiteFooter, SiteHeader } from "@/components/site-chrome";
import { ComplaintChooser } from "@/components/complaint-chooser";
import {
  ClipboardPlus, Search, Clock3, ShieldCheck, BellRing, RefreshCcw,
  Dumbbell, CreditCard, Users, MessageSquareQuote, ArrowRight, CheckCircle2,
} from "lucide-react";

const CATALOG_ITEMS = [
  {
    icon: Dumbbell,
    title: "Facility & Equipment Issues",
    description: "Report malfunctioning treadmills, strength machines, air conditioning, lockers, or hygiene concerns.",
    tag: "Facilities",
    href: "/complaint",
  },
  {
    icon: CreditCard,
    title: "Billing, Membership & Refunds",
    description: "Inquire about subscription fees, plan renewals, payment disputes, or membership freeze requests.",
    tag: "Finance & Accounts",
    href: "/complaint",
  },
  {
    icon: Users,
    title: "Trainer & Staff Assistance",
    description: "Provide feedback or raise concerns regarding personal training sessions, coaches, or reception staff.",
    tag: "Fitness Team",
    href: "/complaint",
  },
  {
    icon: MessageSquareQuote,
    title: "General Inquiries & Feedback",
    description: "Submit suggestions or direct requests to branch management to improve club amenities.",
    tag: "Operations",
    href: "/complaint",
  },
];

const SLA_PROMISES = [
  { icon: Clock3, title: "SLA Guaranteed", text: "Instant ticket creation and automatic round-robin routing to your local branch support team." },
  { icon: BellRing, title: "Dual Email Dispatch", text: "Instant confirmation with ticket reference to your inbox plus central support alert." },
  { icon: RefreshCcw, title: "72-Hour Reopen Window", text: "Not satisfied with the outcome? Reopen the ticket within 72 hours before automatic closure." },
  { icon: ShieldCheck, title: "Secure Tracking", text: "Check progress anytime with your Ticket ID and mobile number — zero password required." },
];

export default function HomePage() {
  return (
    <div className="flex min-h-screen flex-col bg-[#f4f6f8] text-[#161f28]">
      <SiteHeader />

      <main className="flex-1">
        {/* ServiceNow Service Portal Hero Banner */}
        <section className="border-b border-[#2a374a] bg-gradient-to-b from-[#161f28] to-[#1c2836] py-14 sm:py-20 text-white shadow-sm">
          <div className="mx-auto max-w-4xl px-4 text-center sm:px-6">
            <span className="inline-flex items-center gap-1.5 rounded bg-[#1f70c1]/20 px-3 py-1 text-xs font-semibold text-[#60a5fa] border border-[#1f70c1]/40 mb-3">
              <span className="h-2 w-2 rounded-full bg-[#30c497] animate-pulse" />
              ServiceNow Service Portal • FitClass Resolution Center
            </span>

            <h1 className="text-3xl font-extrabold tracking-tight sm:text-5xl">
              How can we help you today?
            </h1>
            <p className="mx-auto mt-3 max-w-xl text-xs sm:text-sm text-slate-300">
              Submit an issue at any of our 34 luxury club locations or track live updates on your existing request.
            </p>

            {/* ServiceNow Big Search Bar */}
            <div className="mx-auto mt-8 max-w-2xl">
              <form action="/track" method="GET" className="relative flex items-center shadow-lg rounded">
                <Search className="pointer-events-none absolute left-4 h-5 w-5 text-slate-400" />
                <input
                  type="text"
                  name="ticket"
                  placeholder="Enter your Ticket ID (e.g. FC-2026-000001 or MSP-2026-...) to track live status..."
                  className="h-13 w-full rounded border border-slate-700 bg-[#0f161e] pl-12 pr-32 text-xs sm:text-sm text-white placeholder-slate-400 transition focus:border-[#1f70c1] focus:bg-[#161f28] focus:outline-none focus:ring-2 focus:ring-[#1f70c1]"
                />
                <button
                  type="submit"
                  className="absolute right-2 h-9 rounded bg-[#1f70c1] px-4 text-xs font-bold text-white transition hover:bg-[#155799]"
                >
                  Track Now
                </button>
              </form>
            </div>

            {/* Quick Actions Under Hero */}
            <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
              <ComplaintChooser variant="hero" />
              <Link
                href="/track"
                className="inline-flex items-center gap-1.5 rounded border border-slate-700 bg-[#101721] px-5 py-2.5 text-xs font-bold text-slate-200 transition hover:border-[#1f70c1] hover:text-white"
              >
                <Search className="h-3.5 w-3.5 text-[#38bdf8]" />
                Track an Existing Ticket
              </Link>
            </div>
          </div>
        </section>

        {/* Service Catalog Cards Section */}
        <section className="mx-auto max-w-6xl px-4 py-12 sm:px-6">
          <div className="mb-6 flex flex-wrap items-end justify-between gap-2 border-b border-[#d1d7dc] pb-3">
            <div>
              <p className="text-[11px] font-bold uppercase tracking-wider text-[#1f70c1]">Service Catalog</p>
              <h2 className="text-xl font-bold text-[#161f28]">Request & Issue Categories</h2>
            </div>
            <Link href="/complaint" className="text-xs font-semibold text-[#1f70c1] hover:underline flex items-center gap-1">
              View all 34 branches <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>

          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {CATALOG_ITEMS.map((item) => (
              <Link
                key={item.title}
                href={item.href}
                className="group flex flex-col justify-between rounded border border-[#d1d7dc] bg-white p-5 shadow-xs transition duration-200 hover:-translate-y-0.5 hover:border-[#1f70c1] hover:shadow-md"
              >
                <div>
                  <div className="mb-4 flex h-10 w-10 items-center justify-center rounded bg-[#eff6ff] text-[#1f70c1] group-hover:bg-[#1f70c1] group-hover:text-white transition">
                    <item.icon className="h-5 w-5" />
                  </div>
                  <span className="rounded bg-slate-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-slate-600">
                    {item.tag}
                  </span>
                  <h3 className="mt-2 text-sm font-bold text-[#161f28] group-hover:text-[#1f70c1] transition">
                    {item.title}
                  </h3>
                  <p className="mt-1.5 text-xs text-slate-500 leading-relaxed">
                    {item.description}
                  </p>
                </div>

                <div className="mt-5 flex items-center text-xs font-semibold text-[#1f70c1] group-hover:underline">
                  Submit Request →
                </div>
              </Link>
            ))}
          </div>
        </section>

        {/* SLA & Service Commitments */}
        <section className="border-t border-[#d1d7dc] bg-white py-12">
          <div className="mx-auto max-w-6xl px-4 sm:px-6">
            <div className="mb-8 text-center sm:text-left">
              <span className="text-[11px] font-bold uppercase tracking-wider text-[#1f70c1]">ITIL Service Standards</span>
              <h2 className="mt-1 text-xl font-bold text-[#161f28]">Our Commitment to Resolution</h2>
              <p className="text-xs text-slate-500">Every complaint is bound by real-time SLA metrics monitored 24/7.</p>
            </div>

            <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
              {SLA_PROMISES.map((p) => (
                <div key={p.title} className="rounded border border-slate-200 bg-[#f8fafc] p-4 text-xs">
                  <div className="mb-3 flex h-8 w-8 items-center justify-center rounded bg-[#1f70c1]/10 text-[#1f70c1]">
                    <p.icon className="h-4 w-4" />
                  </div>
                  <h3 className="font-bold text-[#161f28]">{p.title}</h3>
                  <p className="mt-1 text-slate-500 leading-relaxed">{p.text}</p>
                </div>
              ))}
            </div>
          </div>
        </section>
      </main>

      <SiteFooter />
    </div>
  );
}
