"use client";

// Roles & Feature Permissions Matrix Panel
// Configurable by Root Admin to turn on/off every single feature for any designation or role.

import { useCallback, useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Save, ShieldCheck, RotateCcw, Plus, Lock, CheckCircle2, AlertCircle } from "lucide-react";
import type { RolePermissions } from "@/lib/permissions";

interface PermissionDesc {
  label: string;
  description: string;
}

export function PermissionsPanel() {
  const { toast } = useToast();
  const [matrix, setMatrix] = useState<Record<string, RolePermissions> | null>(null);
  const [descriptions, setDescriptions] = useState<Record<keyof RolePermissions, PermissionDesc> | null>(null);
  const [defaultPresets, setDefaultPresets] = useState<Record<string, RolePermissions> | null>(null);
  const [activeKey, setActiveKey] = useState<string>("Senior Support Agent");
  const [newDesignation, setNewDesignation] = useState("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/v1/admin/permissions");
      const body = await res.json();
      if (body.success) {
        setMatrix(body.data.matrix);
        setDescriptions(body.data.descriptions);
        setDefaultPresets(body.data.defaultPresets);
        if (!body.data.matrix["Senior Support Agent"]) {
          const firstKey = Object.keys(body.data.matrix)[0];
          if (firstKey) setActiveKey(firstKey);
        }
      }
    } catch {
      toast({ title: "Failed to load permissions matrix", variant: "destructive" });
    }
  }, [toast]);

  useEffect(() => {
    load();
  }, [load]);

  if (!matrix || !descriptions) {
    return (
      <Card>
        <CardContent className="flex items-center gap-2 p-6 text-sm text-slate-500">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading permissions matrix…
        </CardContent>
      </Card>
    );
  }

  const activePerms = matrix[activeKey] || matrix.SUPPORT_AGENT;
  const isRootAdmin = activeKey === "ROOT_ADMIN";

  const togglePermission = (permKey: keyof RolePermissions) => {
    if (isRootAdmin) return; // Invariant: Root Admin has 100% permissions
    setMatrix((prev) => {
      if (!prev) return prev;
      const current = prev[activeKey] || { ...prev.SUPPORT_AGENT };
      return {
        ...prev,
        [activeKey]: {
          ...current,
          [permKey]: !current[permKey],
        },
      };
    });
  };

  const handleAddDesignation = () => {
    const trimmed = newDesignation.trim();
    if (!trimmed) return;
    if (matrix[trimmed]) {
      toast({ title: "Designation already exists in matrix", variant: "destructive" });
      return;
    }
    const basePreset = trimmed.toLowerCase().includes("junior")
      ? matrix["Junior Support Agent"] || matrix.SUPPORT_AGENT
      : trimmed.toLowerCase().includes("senior")
      ? matrix["Senior Support Agent"] || matrix.SUPPORT_AGENT
      : matrix.SUPPORT_AGENT;

    setMatrix((prev) => ({
      ...prev!,
      [trimmed]: { ...basePreset },
    }));
    setActiveKey(trimmed);
    setNewDesignation("");
    toast({ title: `Added "${trimmed}" to permissions matrix` });
  };

  const handleResetDefaults = () => {
    if (!defaultPresets) return;
    setMatrix({ ...defaultPresets });
    toast({ title: "Reset matrix to default ITIL presets" });
  };

  const handleSave = async () => {
    setBusy(true);
    try {
      const res = await fetch("/api/v1/admin/permissions", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          matrix,
          reason: reason.trim() || `Updated permissions for ${activeKey}`,
        }),
      });
      const body = await res.json();
      if (body.success) {
        setMatrix(body.data.matrix);
        setReason("");
        toast({
          title: "Permissions matrix saved successfully",
          description: "All changes applied immediately and recorded in configuration audit.",
        });
      } else {
        toast({
          title: "Failed to save permissions",
          description: body.error?.message || "Unknown error",
          variant: "destructive",
        });
      }
    } catch {
      toast({ title: "Failed to save permissions", variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  const keys = Object.keys(matrix);
  const systemRoles = ["ROOT_ADMIN", "CENTRAL_ADMIN", "CENTRAL_AGENT", "BRANCH_MANAGER", "SUPPORT_AGENT"];
  const designations = keys.filter((k) => !systemRoles.includes(k));

  return (
    <Card className="border-[#D1D7DC] shadow-sm">
      <CardHeader className="border-b border-[#D1D7DC] bg-slate-50/70 pb-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <ShieldCheck className="h-5 w-5 text-[#1F70C1]" />
              <CardTitle className="text-base font-semibold text-[#161F28]">
                Role &amp; Designation Feature Matrix
              </CardTitle>
            </div>
            <CardDescription className="mt-1 text-xs text-slate-500">
              Root Admin control: Turn ON or OFF every single feature in this project for any designation or role.
            </CardDescription>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handleResetDefaults}
              className="text-xs text-slate-600 hover:text-slate-900"
            >
              <RotateCcw className="mr-1.5 h-3.5 w-3.5" />
              Reset Defaults
            </Button>
            <Button
              size="sm"
              onClick={handleSave}
              disabled={busy}
              className="bg-[#1F70C1] text-xs text-white hover:bg-[#185999]"
            >
              {busy ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Save className="mr-1.5 h-3.5 w-3.5" />}
              Save Matrix
            </Button>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-6 pt-5">
        {/* Roles & Designation Picker */}
        <div>
          <Label className="text-xs font-semibold uppercase tracking-wider text-slate-500">
            Select Role or Designation to Configure
          </Label>
          <div className="mt-2.5 flex flex-wrap gap-2">
            <div className="flex flex-wrap gap-1.5 rounded-lg border border-slate-200 bg-slate-100/60 p-1">
              <span className="self-center px-2 text-[11px] font-bold uppercase tracking-wider text-slate-400">
                System Roles:
              </span>
              {systemRoles.map((roleKey) => (
                <button
                  key={roleKey}
                  type="button"
                  onClick={() => setActiveKey(roleKey)}
                  className={`flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                    activeKey === roleKey
                      ? "bg-[#161F28] text-white shadow-sm"
                      : "text-slate-700 hover:bg-slate-200"
                  }`}
                >
                  {roleKey === "ROOT_ADMIN" && <Lock className="h-3 w-3 text-amber-400" />}
                  {roleKey}
                </button>
              ))}
            </div>

            <div className="flex flex-wrap gap-1.5 rounded-lg border border-teal-200 bg-teal-50/40 p-1">
              <span className="self-center px-2 text-[11px] font-bold uppercase tracking-wider text-teal-700">
                Designations:
              </span>
              {designations.map((desigKey) => (
                <button
                  key={desigKey}
                  type="button"
                  onClick={() => setActiveKey(desigKey)}
                  className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                    activeKey === desigKey
                      ? "bg-[#036974] text-white shadow-sm"
                      : "text-teal-900 hover:bg-teal-100"
                  }`}
                >
                  {desigKey}
                </button>
              ))}
            </div>
          </div>

          {/* Add custom designation inline */}
          <div className="mt-3 flex max-w-md items-center gap-2">
            <Input
              type="text"
              placeholder="e.g. Lead Support Specialist, Trainee Agent"
              value={newDesignation}
              onChange={(e) => setNewDesignation(e.target.value)}
              className="h-8 text-xs"
            />
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleAddDesignation}
              disabled={!newDesignation.trim()}
              className="h-8 shrink-0 text-xs"
            >
              <Plus className="mr-1 h-3.5 w-3.5" />
              Add Designation
            </Button>
          </div>
        </div>

        {/* Active Selection Banner */}
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-[#D1D7DC] bg-[#F4F6F8] p-3">
          <div className="flex items-center gap-2.5">
            <span className="font-semibold text-slate-800 text-sm">Active Scope:</span>
            <Badge className="bg-[#1F70C1] text-xs font-semibold">{activeKey}</Badge>
            {isRootAdmin ? (
              <Badge variant="outline" className="border-amber-300 bg-amber-50 text-amber-800 text-[11px]">
                <Lock className="mr-1 h-3 w-3" /> Root Admin always maintains 100% full privileges
              </Badge>
            ) : activeKey === "Junior Support Agent" ? (
              <Badge variant="outline" className="border-sky-300 bg-sky-50 text-sky-800 text-[11px]">
                <CheckCircle2 className="mr-1 h-3 w-3 text-sky-600" /> Only sees assigned tickets; global search &amp; reassignment enabled
              </Badge>
            ) : activeKey === "Senior Support Agent" ? (
              <Badge variant="outline" className="border-emerald-300 bg-emerald-50 text-emerald-800 text-[11px]">
                <CheckCircle2 className="mr-1 h-3 w-3 text-emerald-600" /> Full branch ticket visibility with condition filters
              </Badge>
            ) : null}
          </div>
        </div>

        {/* Feature Toggles Grid */}
        <div className="grid gap-3 sm:grid-cols-2">
          {(Object.entries(descriptions) as [keyof RolePermissions, PermissionDesc][]).map(([key, desc]) => {
            const enabled = activePerms[key] ?? false;
            return (
              <div
                key={key}
                onClick={() => !isRootAdmin && togglePermission(key)}
                className={`flex cursor-pointer select-none items-start justify-between gap-3 rounded-lg border p-3 transition-colors ${
                  enabled
                    ? "border-[#D1D7DC] bg-white hover:border-[#1F70C1]/60"
                    : "border-slate-200 bg-slate-50/70 opacity-75 hover:opacity-100"
                }`}
              >
                <div className="space-y-0.5 pr-2">
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs font-bold text-slate-900">{desc.label}</span>
                    {key === "viewAllBranchTickets" && (
                      <span className="rounded bg-indigo-50 px-1.5 py-0.2 text-[10px] font-semibold text-indigo-700">
                        Senior vs Junior Core
                      </span>
                    )}
                    {key === "searchGlobally" && (
                      <span className="rounded bg-sky-50 px-1.5 py-0.2 text-[10px] font-semibold text-sky-700">
                        Global Lookup
                      </span>
                    )}
                    {key === "reassignTickets" && (
                      <span className="rounded bg-amber-50 px-1.5 py-0.2 text-[10px] font-semibold text-amber-700">
                        Reassign Mistaken
                      </span>
                    )}
                  </div>
                  <p className="text-[11px] leading-relaxed text-slate-500">{desc.description}</p>
                </div>
                <div className="pt-0.5" onClick={(e) => e.stopPropagation()}>
                  <Switch
                    checked={enabled}
                    disabled={isRootAdmin}
                    onCheckedChange={() => togglePermission(key)}
                    aria-label={desc.label}
                  />
                </div>
              </div>
            );
          })}
        </div>

        {/* Audit Reason Input */}
        <div className="rounded-lg border border-slate-200 bg-white p-3 space-y-2">
          <Label htmlFor="audit_reason" className="text-xs font-medium text-slate-700">
            Audit Reason for Change (recorded in System Settings Config Audit):
          </Label>
          <div className="flex gap-2">
            <Input
              id="audit_reason"
              type="text"
              placeholder={`e.g. Granted global lookup and reassignment permission to ${activeKey}`}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className="h-8 text-xs"
            />
            <Button
              size="sm"
              onClick={handleSave}
              disabled={busy}
              className="h-8 shrink-0 bg-[#1F70C1] text-xs text-white hover:bg-[#185999]"
            >
              {busy ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Save className="mr-1.5 h-3.5 w-3.5" />}
              Save Changes
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
