"use client";

// The single customer entry point: a "Complaint" button that opens exactly two
// options — Register a complaint or Track a complaint. Used on the landing
// page hero and in the public site header.

import { useState } from "react";
import Link from "next/link";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { ClipboardPlus, MessageSquareText, Search } from "lucide-react";

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
      text: "Facing an issue with your service or project? Get a unique ticket number instantly — no account needed.",
      iconBg: "bg-[#0a2350]",
    },
    {
      href: "/track",
      icon: Search,
      title: "Track a complaint",
      text: "Check the live status of an existing ticket with your Ticket ID and registered mobile number.",
      iconBg: "bg-[#2c6bdf]",
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
              ? "inline-flex items-center gap-2 rounded-lg bg-white px-7 py-3.5 text-base font-bold text-[#0a2350] shadow-lg transition hover:bg-blue-50 hover:shadow-xl active:scale-[0.98]"
              : "flex items-center gap-1.5 rounded-md bg-[#2c6bdf] px-3.5 py-1.5 text-sm font-medium text-white hover:bg-[#1d56c4]")
          }
        >
          <MessageSquareText className={variant === "hero" ? "h-5 w-5" : "h-4 w-4"} aria-hidden />
          Complaint
        </button>
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="text-lg font-bold text-[#0a2350]">What would you like to do?</DialogTitle>
          <DialogDescription>Choose one of the two options below — no login required.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-3 pb-1">
          {options.map((o) => (
            <Link
              key={o.href}
              href={o.href}
              onClick={() => setOpen(false)}
              className="group flex items-start gap-3.5 rounded-xl border border-slate-200 bg-white p-4 transition hover:-translate-y-0.5 hover:border-[#2c6bdf]/50 hover:shadow-sm"
            >
              <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-white ${o.iconBg}`}>
                <o.icon className="h-5 w-5" aria-hidden />
              </span>
              <span>
                <span className="block text-[15px] font-semibold text-[#0a2350]">{o.title}</span>
                <span className="mt-0.5 block text-sm leading-relaxed text-slate-500">{o.text}</span>
                <span className="mt-1.5 block text-sm font-medium text-[#2c6bdf] group-hover:underline">Continue →</span>
              </span>
            </Link>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
