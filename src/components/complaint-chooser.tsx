"use client";

// The single customer entry point: a "Complaint" button that opens exactly two
// options — Register a complaint or Track a complaint. Used on the landing
// page hero, in the public site header, and in embeddable widgets for fitclass.in.

import { useState } from "react";
import Link from "next/link";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { ClipboardPlus, MessageSquareText, Search, ArrowRight } from "lucide-react";

interface ComplaintChooserProps {
  variant?: "hero" | "header";
  className?: string;
}

export function ComplaintChooser({ variant = "hero", className }: ComplaintChooserProps) {
  const [open, setOpen] = useState(false);

  const options = [
    {
      href: "/complaint",
      icon: ClipboardPlus,
      title: "Register a complaint",
      text: "Facing an issue at your FitClass gym? Get an official ticket number instantly — no account needed.",
      iconBg: "bg-gradient-to-br from-[#22618b] to-[#1a4c6e]",
      badge: "Instant Ticket",
    },
    {
      href: "/track",
      icon: Search,
      title: "Track a complaint",
      text: "Check live SLA status of an existing ticket with your Ticket ID (e.g. FC-2026-000123) and registered phone.",
      iconBg: "bg-gradient-to-br from-[#2563eb] to-[#1d4ed8]",
      badge: "Live Status",
    },
  ];

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <button
          type="button"
          aria-label="Open complaint options"
          className={
            className ||
            (variant === "hero"
              ? "inline-flex items-center gap-2.5 rounded-xl bg-gradient-to-r from-[#22618b] to-[#1a4c6e] px-7 py-3.5 text-base font-extrabold text-white shadow-[0_4px_18px_rgba(114, 189, 208,0.45)] transition hover:brightness-110 active:scale-[0.98]"
              : "flex items-center gap-2 rounded-xl bg-gradient-to-r from-[#22618b] to-[#1a4c6e] px-4 py-2 text-xs font-extrabold text-white shadow-[0_2px_10px_rgba(114, 189, 208,0.35)] transition hover:brightness-110 active:scale-95")
          }
        >
          <MessageSquareText className={variant === "hero" ? "h-5 w-5" : "h-4 w-4"} aria-hidden />
          <span>Complaint</span>
        </button>
      </DialogTrigger>
      <DialogContent className="max-w-lg border border-[#ffffff14] bg-[#13131a] text-[#f4f4f7] sm:rounded-2xl">
        <DialogHeader>
          <DialogTitle className="text-xl font-extrabold text-white">What would you like to do?</DialogTitle>
          <DialogDescription className="text-xs text-[#a1a1aa]">
            Select one of the options below to proceed. Zero password or registration required.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-3.5 pt-2 pb-1">
          {options.map((o) => (
            <Link
              key={o.href}
              href={o.href}
              onClick={() => setOpen(false)}
              className="group flex items-start gap-4 rounded-xl border border-[#ffffff14] bg-[#171722] p-4.5 transition hover:-translate-y-0.5 hover:border-[#72bdd0]/60 hover:bg-[#1c1c28] hover:shadow-lg"
            >
              <span className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-xl text-white shadow-md ${o.iconBg}`}>
                <o.icon className="h-6 w-6" aria-hidden />
              </span>
              <span className="flex-1">
                <span className="flex items-center justify-between">
                  <span className="text-base font-bold text-white group-hover:text-[#72bdd0] transition">
                    {o.title}
                  </span>
                  <span className="rounded-full bg-[#ffffff0d] px-2.5 py-0.5 text-[10px] font-semibold text-[#a1a1aa]">
                    {o.badge}
                  </span>
                </span>
                <span className="mt-1 block text-xs leading-relaxed text-[#a1a1aa]">{o.text}</span>
                <span className="mt-2.5 inline-flex items-center gap-1 text-xs font-bold text-[#72bdd0] group-hover:underline">
                  Proceed Now <ArrowRight className="h-3 w-3 transition group-hover:translate-x-0.5" />
                </span>
              </span>
            </Link>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
