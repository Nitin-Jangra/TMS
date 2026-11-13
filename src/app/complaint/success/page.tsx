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
    document.title = `Ticket ${ticket} registered — FitClass CMS`;
  }, [ticket]);

  return (
    <main className="mx-auto w-full max-w-xl flex-1 px-4 py-10">
      <div className="brand-ring rounded-xl border border-slate-200 bg-white p-8 text-center">
        <span className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-emerald-50">
          <CheckCircle2 className="h-8 w-8 text-emerald-600" aria-hidden />
        </span>
        <h1 className="text-xl font-bold text-[#0a2350]">Complaint registered successfully</h1>
        <p className="mt-2 text-sm leading-relaxed text-slate-500">
          We sincerely apologize for the inconvenience you have experienced. Your complaint has
          been successfully registered with FitClass. Our support team will review your concern
          and work towards resolving it as soon as possible.
        </p>

        <div className="mt-6 rounded-lg border border-dashed border-[#2c6bdf]/40 bg-[#eaf1fb]/60 p-5">
          <p className="flex items-center justify-center gap-1.5 text-xs font-medium uppercase tracking-wide text-slate-500">
            <Ticket className="h-3.5 w-3.5" aria-hidden />
            Your Ticket ID
          </p>
          <p className="mt-2 font-mono text-2xl font-bold tracking-wider text-[#0a2350]" aria-live="polite">
            {ticket || "—"}
          </p>
          <Button
            variant="outline"
            size="sm"
            className="mt-3"
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(ticket);
                setCopied(true);
                toast({ title: "Ticket ID copied", description: "Save it — you will need it to track and reopen." });
                setTimeout(() => setCopied(false), 2000);
              } catch {
                toast({ title: "Could not copy", description: "Please note the ticket ID down manually." });
              }
            }}
          >
            <Copy className="mr-1.5 h-3.5 w-3.5" aria-hidden />
            {copied ? "Copied" : "Copy Ticket ID"}
          </Button>
        </div>

        <div className="mt-6 space-y-2 text-left text-sm text-slate-600">
          <p className="font-medium text-[#0a2350]">What happens next?</p>
          <ol className="list-decimal space-y-1.5 pl-5 text-[13px] leading-relaxed">
            <li>An acknowledgement email has been sent to your registered address.</li>
            <li>Your complaint is auto-assigned to a support executive at your branch (round-robin).</li>
            <li>Track progress anytime with your Ticket ID + registered mobile number.</li>
            <li>After resolution you can reopen the ticket within the reopening window.</li>
          </ol>
        </div>

        <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:justify-center">
          <Link href="/track">
            <Button className="w-full bg-[#2c6bdf] hover:bg-[#1c4297] sm:w-auto">
              <Search className="mr-2 h-4 w-4" aria-hidden />
              Track this complaint
            </Button>
          </Link>
          <Link href="/">
            <Button variant="outline" className="w-full sm:w-auto">Back to home</Button>
          </Link>
        </div>
      </div>
    </main>
  );
}

export default function ComplaintSuccessPage() {
  return (
    <div className="flex min-h-screen flex-col">
      <SiteHeader />
      <Suspense fallback={<div className="flex-1" />}>
        <SuccessInner />
      </Suspense>
      <SiteFooter />
    </div>
  );
}
