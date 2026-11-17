"use client";

// Complaint success page: displays the generated ticket number and next steps.

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { SiteFooter, SiteHeader } from "@/components/site-chrome";
import { Button } from "@/components/ui/button";
import { CheckCircle2, Copy, Search, Ticket } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

function SuccessInner() {
  const params = useSearchParams();
  const ticket = params.get("ticket") || "";
  const { toast } = useToast();
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    document.title = `Ticket ${ticket} registered — FitClass`;
  }, [ticket]);

  return (
    <main className="mx-auto w-full max-w-xl flex-1 px-4 py-12 sm:py-16">
      <div className="rounded-2xl border border-[#ffffff14] bg-[#13131a] p-8 text-center shadow-2xl backdrop-blur-md sm:p-10">
        <span className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400">
          <CheckCircle2 className="h-8 w-8" aria-hidden />
        </span>
        <h1 className="text-2xl font-extrabold tracking-tight text-white sm:text-3xl">
          Complaint Registered Successfully
        </h1>
        <p className="mt-3 text-xs leading-relaxed text-[#a1a1aa] sm:text-sm">
          We have successfully received your concern. Your complaint has been registered with
          <strong className="text-white"> FitClass</strong> and dispatched to your dedicated support team.
        </p>

        <div className="mt-7 rounded-2xl border border-[rgba(114, 189, 208,0.3)] bg-[#171722] p-6 shadow-inner">
          <p className="flex items-center justify-center gap-1.5 text-xs font-bold uppercase tracking-wider text-[#72bdd0]">
            <Ticket className="h-3.5 w-3.5" aria-hidden />
            Your Official Ticket Number
          </p>
          <p className="mt-2 font-mono text-3xl font-extrabold tracking-wider text-white" aria-live="polite">
            {ticket || "—"}
          </p>
          <Button
            variant="outline"
            size="sm"
            className="mt-4 rounded-xl border-[#ffffff24] bg-[#13131a] text-xs font-bold text-[#f4f4f7] hover:border-[#72bdd0] hover:text-[#72bdd0]"
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(ticket);
                setCopied(true);
                toast({ title: "Ticket ID copied", description: "Save it — you will need it to track resolution progress." });
                setTimeout(() => setCopied(false), 2000);
              } catch {
                toast({ title: "Could not copy", description: "Please note the ticket ID down manually." });
              }
            }}
          >
            <Copy className="mr-1.5 h-3.5 w-3.5 text-[#72bdd0]" aria-hidden />
            {copied ? "Copied to Clipboard!" : "Copy Ticket ID"}
          </Button>
        </div>

        <div className="mt-7 space-y-2 rounded-xl border border-[#ffffff14] bg-[#171722]/60 p-4 text-left text-xs text-[#a1a1aa]">
          <p className="font-bold text-white uppercase tracking-wider text-[11px]">What happens next?</p>
          <ol className="list-decimal space-y-1.5 pl-4 text-xs leading-relaxed">
            <li>A confirmation email has been dispatched with your ticket details and greeting message.</li>
            <li>Your complaint is routed to an assigned operations manager for immediate investigation.</li>
            <li>You can track live resolution anytime using your Ticket ID + mobile number.</li>
            <li>After resolution, you retain a 72-hour window to review or reopen if needed.</li>
          </ol>
        </div>

        <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:justify-center">
          <Link href={`/track?ticket=${encodeURIComponent(ticket)}`}>
            <Button
              style={{
                background: "linear-gradient(135deg, #22618b, #1a4c6e)",
                boxShadow: "0 4px 16px rgba(114, 189, 208, 0.4)",
              }}
              className="h-11 w-full rounded-xl border-none text-xs font-extrabold text-white transition hover:brightness-110 sm:w-auto sm:px-6"
            >
              <Search className="mr-2 h-4 w-4" aria-hidden />
              Track This Complaint
            </Button>
          </Link>
          <Link href="/">
            <Button variant="outline" className="h-11 w-full rounded-xl border-[#ffffff24] bg-[#171722] text-xs font-bold text-[#f4f4f7] hover:bg-[#1c1c28] sm:w-auto sm:px-6">
              Back to Home
            </Button>
          </Link>
        </div>
      </div>
    </main>
  );
}

export default function ComplaintSuccessPage() {
  return (
    <div className="flex min-h-screen flex-col bg-[#0c0c10] text-[#f4f4f7] selection:bg-[#22618b]/30 selection:text-white">
      <SiteHeader />
      <Suspense fallback={<div className="flex-1" />}>
        <SuccessInner />
      </Suspense>
      <SiteFooter />
    </div>
  );
}
