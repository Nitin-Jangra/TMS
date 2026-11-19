"use client";

// Rating page opened from the link in the "your ticket is resolved" email.
// The signed token in the link identifies the ticket — no login needed.

import { useEffect, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";
import Link from "next/link";
import { SiteFooter, SiteHeader } from "@/components/site-chrome";
import { RatingForm } from "@/components/rating-form";
import { AlertCircle, Loader2, Star } from "lucide-react";

interface State {
  ticketNumber: string;
  customerFirstName: string;
  branchName: string;
  status: string;
  canRate: boolean;
  feedback: { rating: number; comment: string } | null;
}

export default function FeedbackPage() {
  const { ticketNumber } = useParams<{ ticketNumber: string }>();
  const token = useSearchParams().get("t") || "";
  const [state, setState] = useState<State | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    const q = new URLSearchParams({ ticketNumber: decodeURIComponent(ticketNumber), t: token });
    fetch(`/api/v1/public/feedback?${q.toString()}`)
      .then((r) => r.json())
      .then((d) => (d.success ? setState(d.data) : setError(d.error?.message || "This link is not valid.")))
      .catch(() => setError("Network error. Please try again."));
  }, [ticketNumber, token]);

  return (
    <div className="flex min-h-screen flex-col bg-[#0c0c10] text-[#f4f4f7]">
      <SiteHeader />
      <main className="mx-auto w-full max-w-xl flex-1 px-4 py-10 sm:py-14">
        <div className="rounded-2xl border border-[#ffffff14] bg-[#13131a] p-7 shadow-2xl sm:p-9">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-[#72bdd0]/30 bg-[#72bdd0]/10 px-3 py-1 text-xs font-bold text-[#72bdd0]">
            <Star className="h-3 w-3" aria-hidden /> Member feedback
          </span>

          {error ? (
            <div className="mt-6 flex items-start gap-3 rounded-xl border border-red-500/30 bg-red-950/20 p-4 text-sm text-red-200">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
              <div>
                {error}
                <p className="mt-2 text-xs text-[#a1a1aa]">
                  You can also rate from the <Link href="/track" className="text-[#72bdd0] underline">ticket tracking page</Link> with your ticket ID and mobile number.
                </p>
              </div>
            </div>
          ) : !state ? (
            <div className="mt-8 flex items-center gap-2 text-sm text-[#a1a1aa]"><Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Loading…</div>
          ) : (
            <div className="mt-4 space-y-5">
              <div>
                <h1 className="text-2xl font-extrabold tracking-tight text-white">
                  {state.customerFirstName ? `Hi ${state.customerFirstName},` : "Hello,"}
                </h1>
                <p className="mt-1.5 text-sm text-[#a1a1aa]">
                  Ticket <span className="font-mono text-white">{state.ticketNumber}</span> at FitClass {state.branchName}.
                </p>
              </div>
              {state.feedback ? (
                <div className="rounded-2xl border border-[#ffffff14] bg-[#171722] p-5 text-sm">
                  <p className="font-bold text-white">You already rated this ticket {state.feedback.rating}/5 — thank you!</p>
                  {state.feedback.comment ? <p className="mt-2 text-xs text-[#a1a1aa]">“{state.feedback.comment}”</p> : null}
                </div>
              ) : state.canRate ? (
                <RatingForm ticketNumber={state.ticketNumber} token={token} />
              ) : (
                <p className="rounded-2xl border border-[#ffffff14] bg-[#171722] p-5 text-sm text-[#a1a1aa]">
                  This ticket is still being worked on. You can rate our support once it is resolved.
                </p>
              )}
            </div>
          )}
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}
