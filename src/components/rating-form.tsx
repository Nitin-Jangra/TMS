"use client";

// 1–5 star rating + optional comment (public pages, dark site theme).
// Used by the rating link page (/feedback/...) and the tracking page.

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { CheckCircle2, Loader2, Star } from "lucide-react";

const LABELS = ["", "Very poor", "Poor", "Okay", "Good", "Excellent"];

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
      <div className="flex items-start gap-3 rounded-2xl border border-emerald-500/30 bg-emerald-950/20 p-5">
        <CheckCircle2 className="mt-0.5 h-5 w-5 text-emerald-400" aria-hidden />
        <div>
          <p className="text-sm font-bold text-white">Thank you for your feedback!</p>
          <p className="mt-1 text-xs text-[#a1a1aa]">
            {done <= 2 ? "We are sorry we let you down. A manager will look into your experience." : "It helps us keep improving FitClass for every member."}
          </p>
        </div>
      </div>
    );
  }

  const shown = hover || rating;
  return (
    <div className="space-y-4 rounded-2xl border border-[#72bdd0]/30 bg-[rgba(114,189,208,0.06)] p-5">
      <div>
        <p className="text-sm font-bold text-white">How was our support?</p>
        <p className="mt-1 text-xs text-[#a1a1aa]">Rate how we handled ticket {ticketNumber}.</p>
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
              className="rounded-md p-1 transition hover:scale-110 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#72bdd0]"
            >
              <Star className={`h-8 w-8 ${n <= shown ? "fill-amber-400 text-amber-400" : "text-[#3f3f46]"}`} aria-hidden />
            </button>
          ))}
        </div>
        <span className="text-sm font-semibold text-[#e4e4e7]" aria-live="polite">{shown ? LABELS[shown] : ""}</span>
      </div>
      <Textarea
        value={comment}
        onChange={(e) => setComment(e.target.value)}
        maxLength={1000}
        rows={3}
        placeholder={rating && rating <= 2 ? "What went wrong? (optional, helps us fix it)" : "Anything you would like to add? (optional)"}
        className="rounded-xl border-[#ffffff1f] bg-[#171722] text-sm text-[#f4f4f7] placeholder-[#71717a]"
        aria-label="Comment"
      />
      {error ? <p className="text-xs text-red-400" role="alert">{error}</p> : null}
      <Button
        onClick={submit}
        disabled={!rating || busy}
        className="rounded-xl border-none text-xs font-bold text-white"
        style={{ background: "linear-gradient(135deg, #22618b, #1a4c6e)" }}
      >
        {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden /> : null}
        Submit rating
      </Button>
    </div>
  );
}
