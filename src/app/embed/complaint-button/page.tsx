"use client";

// Standalone Embeddable Complaint Button Widget for the Msquare Professionals Website.
// Allows embedding via <iframe src=".../embed/complaint-button" ...> or direct integration.

import { ComplaintChooser } from "@/components/complaint-chooser";

export default function EmbedComplaintButton() {
  return (
    <div className="flex items-center justify-center p-2 bg-transparent">
      <ComplaintChooser variant="hero" className="inline-flex items-center gap-2 rounded-lg bg-[#0a2350] px-6 py-3 text-sm font-bold text-white shadow-md hover:bg-[#12306b] active:scale-95 transition" />
    </div>
  );
}
