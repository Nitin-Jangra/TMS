"use client";

// Searchable staff picker (name / email / branch), grouped by branch, showing
// who is away (availability off, e.g. on leave) and their open ticket load.
// Used by the ticket list "Assigned to" filter and the reassign panel.

import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList, CommandSeparator } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { Check, ChevronsUpDown } from "lucide-react";

export interface StaffEntry {
  id: string;
  name: string;
  email: string;
  role: string;
  designation?: string | null;
  availabilityEnabled: boolean;
  openTickets: number;
  branchId: string | null;
  branch: { id: string; code: string; name: string } | null;
}

export interface SpecialOption {
  value: string;
  label: string;
}

interface Props {
  staff: StaffEntry[];
  value: string;
  onChange: (value: string) => void;
  /** Extra options listed first, e.g. Anyone / Me / Unassigned. */
  special?: SpecialOption[];
  placeholder?: string;
  /** Branch listed first (e.g. the ticket's or the viewer's branch). */
  preferBranchId?: string | null;
  /** Staff ids to hide (e.g. the current assignee). */
  excludeIds?: string[];
  className?: string;
  ariaLabel?: string;
}

/** Every typed word must appear in the name, email or branch (no fuzzy matches). */
function wordFilter(_value: string, search: string, keywords?: string[]): number {
  const hay = (keywords || []).join(" ").toLowerCase();
  const words = search.toLowerCase().split(/s+/).filter(Boolean);
  if (!words.length) return 1;
  if (!words.every((w) => hay.includes(w))) return 0;
  return hay.startsWith(words[0]) ? 1 : 0.5; // name matches first
}

export function StaffPicker({ staff, value, onChange, special = [], placeholder = "Select employee", preferBranchId, excludeIds = [], className, ariaLabel }: Props) {
  const [open, setOpen] = useState(false);

  const groups = useMemo(() => {
    const byBranch = new Map<string, { name: string; code: string; people: StaffEntry[] }>();
    for (const s of staff) {
      if (excludeIds.includes(s.id) || !s.branch) continue;
      const g = byBranch.get(s.branch.id) || { name: s.branch.name, code: s.branch.code, people: [] };
      g.people.push(s);
      byBranch.set(s.branch.id, g);
    }
    return [...byBranch.entries()]
      .sort(([a, ga], [b, gb]) => (a === preferBranchId ? -1 : b === preferBranchId ? 1 : ga.name.localeCompare(gb.name)))
      .map(([id, g]) => ({ id, ...g }));
  }, [staff, excludeIds, preferBranchId]);

  const selectedLabel =
    special.find((o) => o.value === value)?.label ||
    (() => {
      const s = staff.find((p) => p.id === value);
      return s ? `${s.name}${s.branch ? ` · ${s.branch.name}` : ""}` : "";
    })();

  const pickValue = (v: string) => { onChange(v); setOpen(false); };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          aria-label={ariaLabel || placeholder}
          className={cn("h-8 justify-between gap-2 px-2.5 text-xs font-normal", !selectedLabel && "text-slate-400", className)}
        >
          <span className="truncate">{selectedLabel || placeholder}</span>
          <ChevronsUpDown className="h-3.5 w-3.5 shrink-0 opacity-50" aria-hidden />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[320px] p-0" align="start">
        <Command filter={wordFilter}>
          <CommandInput placeholder="Search name, email or branch…" className="h-9 text-xs" />
          <CommandList className="max-h-[320px]">
            <CommandEmpty className="py-4 text-center text-xs text-slate-400">No staff found.</CommandEmpty>
            {special.length ? (
              <>
                <CommandGroup>
                  {special.map((o) => (
                    <CommandItem key={o.value || "__any"} value={`__special:${o.value}`} keywords={[o.label]} onSelect={() => pickValue(o.value)} className="text-xs">
                      <Check className={cn("mr-1.5 h-3.5 w-3.5", value === o.value ? "opacity-100" : "opacity-0")} aria-hidden />
                      {o.label}
                    </CommandItem>
                  ))}
                </CommandGroup>
                <CommandSeparator />
              </>
            ) : null}
            {groups.map((g) => (
              <CommandGroup key={g.id} heading={`${g.name} (${g.code})${g.id === preferBranchId ? " · this branch" : ""}`}>
                {g.people.map((s) => (
                  <CommandItem
                    key={s.id}
                    value={s.id}
                    keywords={[s.name, s.email, g.name, g.code, s.designation || ""]}
                    onSelect={() => pickValue(s.id)}
                    className="text-xs"
                  >
                    <Check className={cn("mr-1.5 h-3.5 w-3.5", value === s.id ? "opacity-100" : "opacity-0")} aria-hidden />
                    <span className="flex-1 truncate">
                      {s.name}
                      {s.role === "BRANCH_MANAGER" ? <span className="ml-1 text-[10px] text-slate-400">manager</span> : null}
                    </span>
                    {!s.availabilityEnabled ? (
                      <span className="rounded bg-amber-100 px-1 py-0.5 text-[10px] font-medium text-amber-800" title="Availability off — on leave / away">away</span>
                    ) : null}
                    <span className="ml-1 text-[10px] text-slate-400" title="Open tickets">{s.openTickets} open</span>
                  </CommandItem>
                ))}
              </CommandGroup>
            ))}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
