"use client";

// "Insert template" button for reply / note boxes. Lists shared + personal
// canned replies (templates for the ticket's category first), fills the
// placeholders and hands the text back.

import { useEffect, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { FileText, Settings2 } from "lucide-react";

interface Template {
  id: string;
  title: string;
  body: string;
  categoryId: string | null;
  isShared: boolean;
}

export interface TemplateContext {
  customerName: string;
  ticketNumber: string;
  branchName: string;
  categoryName: string;
  categoryId?: string;
}

export function fillTemplate(body: string, ctx: TemplateContext & { agentName: string }): string {
  const values: Record<string, string> = {
    customerName: ctx.customerName.split(/\s+/)[0] || ctx.customerName,
    customerFullName: ctx.customerName,
    ticketNumber: ctx.ticketNumber,
    branchName: ctx.branchName,
    categoryName: ctx.categoryName,
    agentName: ctx.agentName,
  };
  return body.replace(/\{\{\s*(\w+)\s*\}\}/g, (m, key: string) => values[key] ?? m);
}

export function CannedPicker({ context, onInsert, disabled }: { context: TemplateContext; onInsert: (text: string) => void; disabled?: boolean }) {
  const [open, setOpen] = useState(false);
  const [templates, setTemplates] = useState<Template[] | null>(null);
  const [agentName, setAgentName] = useState("");

  useEffect(() => {
    if (!open || templates) return;
    const q = context.categoryId ? `?categoryId=${encodeURIComponent(context.categoryId)}` : "";
    fetch(`/api/v1/support/canned${q}`).then((r) => r.json()).then((d) => setTemplates(d.data?.templates ?? [])).catch(() => setTemplates([]));
    fetch("/api/v1/auth/me").then((r) => r.json()).then((d) => setAgentName(d.data?.user?.name || "")).catch(() => undefined);
  }, [open, templates, context.categoryId]);

  const suggested = (templates || []).filter((t) => !!context.categoryId && t.categoryId === context.categoryId);
  const others = (templates || []).filter((t) => !(context.categoryId && t.categoryId === context.categoryId));

  const item = (t: Template) => (
    <CommandItem
      key={t.id}
      value={t.id}
      keywords={[t.title, t.body]}
      onSelect={() => { onInsert(fillTemplate(t.body, { ...context, agentName: agentName || "FitClass Support" })); setOpen(false); }}
      className="flex-col items-start gap-0.5 text-xs"
    >
      <span className="font-medium">{t.title}{!t.isShared ? <span className="ml-1 text-[10px] font-normal text-slate-400">personal</span> : null}</span>
      <span className="line-clamp-2 text-[11px] text-slate-500">{t.body}</span>
    </CommandItem>
  );

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button type="button" variant="ghost" size="sm" className="h-7 gap-1 px-2 text-xs text-[#22618b]" disabled={disabled}>
          <FileText className="h-3.5 w-3.5" aria-hidden /> Insert template
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[380px] p-0" align="end">
        <Command filter={(_v, search, keywords) => {
          const hay = (keywords || []).join(" ").toLowerCase();
          return search.toLowerCase().split(/\s+/).filter(Boolean).every((w) => hay.includes(w)) ? 1 : 0;
        }}>
          <CommandInput placeholder="Search templates…" className="h-9 text-xs" />
          <CommandList className="max-h-[320px]">
            <CommandEmpty className="py-4 text-center text-xs text-slate-400">{templates === null ? "Loading…" : "No templates found."}</CommandEmpty>
            {suggested.length ? <CommandGroup heading="Suggested for this category">{suggested.map(item)}</CommandGroup> : null}
            {others.length ? <CommandGroup heading={suggested.length ? "All templates" : "Templates"}>{others.map(item)}</CommandGroup> : null}
          </CommandList>
        </Command>
        <div className="border-t border-slate-100 p-1.5">
          <Link href="/staff/templates" className="flex items-center gap-1.5 rounded px-2 py-1 text-[11px] text-slate-500 hover:bg-slate-50 hover:text-[#22618b]">
            <Settings2 className="h-3 w-3" aria-hidden /> Manage templates
          </Link>
        </div>
      </PopoverContent>
    </Popover>
  );
}
