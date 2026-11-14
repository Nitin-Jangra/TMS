"use client";

// Standalone Embeddable Complaint Button Widget for the MSquare Professionals Website.
// Allows embedding directly into msquareprofessionals.com via <iframe src="https://tms.nitinjangra0981.workers.dev/embed/complaint-button" ...>
// or direct link integration.

import { ComplaintChooser } from "@/components/complaint-chooser";

export default function EmbedComplaintButton() {
  return (
    <div className="flex items-center justify-center p-2 bg-transparent">
      <ComplaintChooser
        variant="hero"
        className="inline-flex items-center gap-2.5 rounded-xl bg-gradient-to-r from-[#ff6b00] to-[#ff8533] px-6 py-3 text-sm font-extrabold text-white shadow-[0_4px_18px_rgba(255,107,0,0.45)] transition hover:brightness-110 active:scale-95"
      />
    </div>
  );
}
