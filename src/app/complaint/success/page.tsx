"use client";

// Complaint success page: displays the generated ticket number and next steps.
// ServiceNow Employee Center Request Confirmation UI.

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { SiteFooter, SiteHeader } from "@/components/site-chrome";
import { Button } from "@/components/ui/button";
import { CheckCircle2, ChevronRight, Copy, Search, Ticket } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

function SuccessInner() {
  const params = useSearchParams();
  const ticket = params.get("ticket") || "";
  const { toast } = useToast();
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    document.title = `Incident ${ticket} Registered — FitClass Service Portal`;
  }, [ticket]);

  return (
    <main className="mx-auto w-full max-w-2xl flex-1 px-4 py-10 sm:py-14">
      {/* ServiceNow Breadcrumb Trail */}
      <div className="mb-6 flex items-center gap-2 text-xs font-medium text-slate-500">
        <Link href="/" className="hover:text-[#1F70C1] transition-colors">Employee Center</Link>
        <ChevronRight className="h-3 w-3 text-slate-400" />
        <Link href="/complaint" className="hover:text-[#1F70C1] transition-colors">Record Producer</Link>
        <ChevronRight className="h-3 w-3 text-slate-400" />
        <span className="text-slate-900 font-semibold">Incident Confirmation</span>
      </div>

      <div className="overflow-hidden rounded-xl border border-[#D1D7DC] bg-white p-8 text-center shadow-sm sm:p-10">
        <span className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-full bg-[#D1FAE5] border border-[#059669]/20 text-[#065F46]">
          <CheckCircle2 className="h-8 w-8 text-[#059669]" aria-hidden />
        </span>

        <h1 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
          Incident Registered Successfully
        </h1>
        <p className="mt-2 text-xs leading-relaxed text-slate-600 sm:text-sm">
          Your service request has been logged in the FitClass ITIL Service Desk and automatically dispatched to your branch team.
        </p>

        {/* Ticket Reference Badge Box */}
        <div className="mt-7 rounded-xl border border-[#D1D7DC] bg-[#FAFBFC] p-6 shadow-inner">
          <p className="flex items-center justify-center gap-1.5 text-xs font-bold uppercase tracking-wider text-[#00639B]">
            <Ticket className="h-3.5 w-3.5" aria-hidden />
            Official Incident Number
          </p>
          <p className="mt-2 font-mono text-3xl font-extrabold tracking-wider text-slate-900" aria-live="polite">
            {ticket || "—"}
          </p>
          <Button
            variant="outline"
            size="sm"
            className="mt-4 rounded-md border-[#D1D7DC] bg-white text-xs font-semibold text-slate-700 hover:border-[#1F70C1] hover:text-[#1F70C1]"
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(ticket);
                setCopied(true);
                toast({ title: "Incident Number copied", description: "Save this reference ID to track live updates." });
                setTimeout(() => setCopied(false), 2000);
              } catch {
                toast({ title: "Could not copy", description: "Please copy the ticket number manually." });
              }
            }}
          >
            <Copy className="mr-1.5 h-3.5 w-3.5 text-[#1F70C1]" aria-hidden />
            {copied ? "Copied to Clipboard!" : "Copy Incident Number"}
          </Button>
        </div>

        {/* What Happens Next Steps */}
        <div className="mt-7 space-y-2.5 rounded-lg border border-[#E2E8F0] bg-[#FAFBFC] p-5 text-left text-xs text-slate-600">
          <p className="font-bold text-slate-900 uppercase tracking-wider text-[11px]">ITIL Service Next Steps</p>
          <ol className="list-decimal space-y-2 pl-4 text-xs leading-relaxed">
            <li>An automated confirmation email has been dispatched with your ticket details and initial greeting.</li>
            <li>Your ticket is placed in the branch queue and assigned to an operations specialist for immediate triage.</li>
            <li>You can monitor real-time SLA countdowns and staff updates anytime via the Incident Tracker.</li>
            <li>Upon resolution, you maintain a 72-hour window to review and reopen the case if needed.</li>
          </ol>
        </div>

        {/* Action CTAs */}
        <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:justify-center">
          <Link href={`/track?ticket=${encodeURIComponent(ticket)}`}>
            <Button
              className="h-11 w-full rounded-md bg-[#1F70C1] hover:bg-[#185999] text-xs font-bold text-white shadow-sm transition sm:w-auto sm:px-6"
            >
              <Search className="mr-2 h-4 w-4" aria-hidden />
              Track Incident Status
            </Button>
          </Link>
          <Link href="/">
            <Button
              variant="outline"
              className="h-11 w-full rounded-md border-[#D1D7DC] text-xs font-semibold text-slate-700 hover:bg-slate-100 sm:w-auto sm:px-6"
            >
              Back to Employee Center
            </Button>
          </Link>
        </div>
      </div>
    </main>
  );
}

export default function ComplaintSuccessPage() {
  return (
    <div className="flex min-h-screen flex-col bg-[#F4F6F8] text-[#1E293B] selection:bg-[#1F70C1]/20 selection:text-[#1F70C1]">
      <SiteHeader />
      <Suspense fallback={<div className="flex-1" />}>
        <SuccessInner />
      </Suspense>
      <SiteFooter />
    </div>
  );
}
