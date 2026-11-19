"use client";

// 1–5 star rating + optional comment (public pages).
// ServiceNow Service Portal styled Customer Satisfaction (CSAT) widget.

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { CheckCircle2, Loader2, Star } from "lucide-react";

const LABELS = ["", "Very Poor", "Poor", "Adequate", "Good", "Excellent"];

export function RatingForm({
  ticketNumber,
  token,
  mobileNumber,
  onDone,
}: {
  ticketNumber: string;
  token?: string;
  mobileNumber?: string;
  onDone?: (rating: number) => void;
}) {
  const [rating, setRating] = useState(0);
  const [hover, setHover] = useState(0);
  const [comment, setComment] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(0);

  const submit = async () => {
    if (!rating) return;
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/v1/public/feedback", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ticketNumber, rating, comment: comment.trim(), token, mobileNumber }),
      });
      const body = await res.json();
      if (!body.success) {
        setError(body.error?.message || "Could not save your rating. Please try again.");
        return;
      }
      setDone(rating);
      onDone?.(rating);
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  if (done) {
    return (
      <div className="flex items-start gap-3 rounded-lg border border-emerald-200 bg-emerald-50 p-5 text-emerald-900">
        <CheckCircle2 className="mt-0.5 h-5 w-5 text-emerald-600 shrink-0" aria-hidden />
        <div>
          <p className="text-sm font-bold text-emerald-950">Customer Satisfaction (CSAT) Recorded</p>
          <p className="mt-1 text-xs text-emerald-800">
            {done <= 2
              ? "We sincerely apologize for falling short of your expectations. Our regional service manager has been alerted to review this ticket."
              : "Thank you for letting us know! Your feedback helps us continuously improve our service quality."}
          </p>
        </div>
      </div>
    );
  }

  const shown = hover || rating;
  return (
    <div className="space-y-4 rounded-xl border border-[#D1D7DC] bg-[#FAFBFC] p-5 shadow-sm">
      <div className="border-b border-[#E2E8F0] pb-3">
        <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">Service Evaluation</span>
        <h3 className="text-sm font-bold text-slate-900">How would you rate the resolution of Ticket #{ticketNumber}?</h3>
        <p className="mt-0.5 text-xs text-slate-500">Your feedback is submitted directly to the quality assurance team.</p>
      </div>

      <div className="flex items-center gap-3">
        <div className="flex gap-1" role="radiogroup" aria-label="Rating from 1 to 5 stars" onMouseLeave={() => setHover(0)}>
          {[1, 2, 3, 4, 5].map((n) => (
            <button
              key={n}
              type="button"
              role="radio"
              aria-checked={rating === n}
              aria-label={`${n} star${n === 1 ? "" : "s"} — ${LABELS[n]}`}
              onMouseEnter={() => setHover(n)}
              onFocus={() => setHover(n)}
              onBlur={() => setHover(0)}
              onClick={() => setRating(n)}
              className="rounded p-1 transition hover:scale-110 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#1F70C1]"
            >
              <Star className={`h-7 w-7 ${n <= shown ? "fill-amber-400 text-amber-500" : "text-slate-300"}`} aria-hidden />
            </button>
          ))}
        </div>
        <span className="text-xs font-bold text-slate-700" aria-live="polite">{shown ? LABELS[shown] : ""}</span>
      </div>

      <Textarea
        value={comment}
        onChange={(e) => setComment(e.target.value)}
        maxLength={1000}
        rows={3}
        placeholder={rating && rating <= 2 ? "What went wrong with this resolution? (helps us remediate)" : "Additional comments or staff compliments (optional)..."}
        className="rounded-md border-[#D1D7DC] bg-white text-xs text-slate-900 placeholder:text-slate-400 focus:border-[#1F70C1] focus:ring-1 focus:ring-[#1F70C1]"
        aria-label="Comment"
      />
      {error ? <p className="text-xs text-red-600 font-medium" role="alert">{error}</p> : null}

      <Button
        onClick={submit}
        disabled={!rating || busy}
        className="h-9 rounded-md bg-[#1F70C1] hover:bg-[#185999] text-xs font-bold text-white shadow-sm"
      >
        {busy ? <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" aria-hidden /> : null}
        Submit CSAT Rating
      </Button>
    </div>
  );
}
