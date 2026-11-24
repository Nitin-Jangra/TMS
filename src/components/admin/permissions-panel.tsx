"use client";

// Roles & Feature Permissions Matrix Panel
// Configurable by Root Admin to turn on/off every single feature for any designation or role.

import { useCallback, useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import {
  Loader2, Save, ShieldCheck, RotateCcw, Plus, Lock, CheckCircle2,
  Search, CheckCheck, XCircle, Trash2, Sliders, Layers,
} from "lucide-react";
import {
  type RolePermissions,
  type PermissionCategory,
  PERMISSION_CATEGORIES,
  PERMISSION_DESCRIPTIONS,
} from "@/lib/permissions";

interface PermissionDesc {
  label: string;
  description: string;
  category: PermissionCategory;
}

const CATEGORY_COLORS: Record<PermissionCategory, { bg: string; text: string; border: string }> = {
  access: { bg: "bg-indigo-50", text: "text-indigo-700", border: "border-indigo-200" },
  workflow: { bg: "bg-blue-50", text: "text-blue-700", border: "border-blue-200" },
  communication: { bg: "bg-emerald-50", text: "text-emerald-700", border: "border-emerald-200" },
  files: { bg: "bg-amber-50", text: "text-amber-700", border: "border-amber-200" },
  batch_analytics: { bg: "bg-purple-50", text: "text-purple-700", border: "border-purple-200" },
  staff: { bg: "bg-teal-50", text: "text-teal-700", border: "border-teal-200" },
};

export function PermissionsPanel() {
  const { toast } = useToast();
  const [matrix, setMatrix] = useState<Record<string, RolePermissions> | null>(null);
  const [descriptions, setDescriptions] = useState<Record<keyof RolePermissions, PermissionDesc> | null>(null);
  const [defaultPresets, setDefaultPresets] = useState<Record<string, RolePermissions> | null>(null);
  const [activeKey, setActiveKey] = useState<string>("Senior Support Agent");
  const [newDesignation, setNewDesignation] = useState("");
  const [reason, setReason] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string>("all");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/v1/admin/permissions");
      const body = await res.json();
      if (body.success) {
        setMatrix(body.data.matrix);
        setDescriptions(body.data.descriptions || PERMISSION_DESCRIPTIONS);
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

  const activePerms: RolePermissions = useMemo(() => {
    if (!matrix) return {} as RolePermissions;
    return matrix[activeKey] || matrix.SUPPORT_AGENT || ({} as RolePermissions);
  }, [matrix, activeKey]);

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

  const handleSetAll = (enabled: boolean) => {
    if (isRootAdmin) return;
    setMatrix((prev) => {
      if (!prev || !descriptions) return prev;
      const updated = { ...(prev[activeKey] || prev.SUPPORT_AGENT) };
      (Object.keys(descriptions) as (keyof RolePermissions)[]).forEach((key) => {
        updated[key] = enabled;
      });
      return {
        ...prev,
        [activeKey]: updated,
      };
    });
    toast({
      title: `${enabled ? "Enabled" : "Disabled"} all features for ${activeKey}`,
    });
  };

  const handleAddDesignation = () => {
    const trimmed = newDesignation.trim();
    if (!trimmed) return;
    if (matrix && matrix[trimmed]) {
      toast({ title: "Designation already exists in matrix", variant: "destructive" });
      return;
    }
    const basePreset = trimmed.toLowerCase().includes("junior")
      ? matrix?.["Junior Support Agent"] || matrix?.SUPPORT_AGENT
      : trimmed.toLowerCase().includes("senior")
      ? matrix?.["Senior Support Agent"] || matrix?.SUPPORT_AGENT
      : matrix?.SUPPORT_AGENT;

    setMatrix((prev) => ({
      ...prev!,
      [trimmed]: { ...basePreset! },
    }));
    setActiveKey(trimmed);
    setNewDesignation("");
    toast({ title: `Added "${trimmed}" to permissions matrix` });
  };

  const handleDeleteDesignation = (keyToDelete: string) => {
    const protectedKeys = [
      "ROOT_ADMIN", "CENTRAL_ADMIN", "CENTRAL_AGENT", "BRANCH_MANAGER", "SUPPORT_AGENT",
      "Senior Support Agent", "Junior Support Agent",
    ];
    if (protectedKeys.includes(keyToDelete)) {
      toast({ title: "Cannot remove standard role or ITIL preset", variant: "destructive" });
      return;
    }
    setMatrix((prev) => {
      if (!prev) return prev;
      const copy = { ...prev };
      delete copy[keyToDelete];
      return copy;
    });
    setActiveKey("Senior Support Agent");
    toast({ title: `Removed designation "${keyToDelete}"` });
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

  if (!matrix || !descriptions) {
    return (
      <Card>
        <CardContent className="flex items-center gap-2 p-6 text-sm text-slate-500">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading permissions matrix…
        </CardContent>
      </Card>
    );
  }

  const keys = Object.keys(matrix);
  const systemRoles = ["ROOT_ADMIN", "CENTRAL_ADMIN", "CENTRAL_AGENT", "BRANCH_MANAGER", "SUPPORT_AGENT"];
  const designations = keys.filter((k) => !systemRoles.includes(k));

  const allEntries = Object.entries(descriptions) as [keyof RolePermissions, PermissionDesc][];
  const enabledCount = allEntries.filter(([k]) => activePerms[k]).length;
  const totalCount = allEntries.length;

  const filteredEntries = allEntries.filter(([key, desc]) => {
    if (selectedCategory !== "all" && desc.category !== selectedCategory) {
      return false;
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      return (
        desc.label.toLowerCase().includes(q) ||
        desc.description.toLowerCase().includes(q) ||
        key.toLowerCase().includes(q)
      );
    }
    return true;
  });

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
                <div key={desigKey} className="flex items-center">
                  <button
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
                  {!["Senior Support Agent", "Junior Support Agent"].includes(desigKey) && (
                    <button
                      type="button"
                      onClick={() => handleDeleteDesignation(desigKey)}
                      title={`Delete custom designation "${desigKey}"`}
                      className="ml-0.5 rounded p-0.5 text-red-500 hover:bg-red-50 hover:text-red-700"
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Add custom designation inline */}
          <div className="mt-3 flex max-w-md items-center gap-2">
            <Input
              type="text"
              placeholder="e.g. Lead Support Specialist, Billing Executive"
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

        {/* Active Selection Banner with Bulk Toggles */}
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-[#D1D7DC] bg-[#F4F6F8] p-3">
          <div className="flex flex-wrap items-center gap-2.5">
            <span className="font-semibold text-slate-800 text-sm">Active Scope:</span>
            <Badge className="bg-[#1F70C1] text-xs font-semibold">{activeKey}</Badge>
            <Badge variant="outline" className="border-slate-300 bg-white text-slate-700 text-xs">
              {enabledCount} of {totalCount} features enabled
            </Badge>
            {isRootAdmin ? (
              <Badge variant="outline" className="border-amber-300 bg-amber-50 text-amber-800 text-[11px]">
                <Lock className="mr-1 h-3 w-3" /> Root Admin always maintains 100% full privileges
              </Badge>
            ) : null}
          </div>

          {!isRootAdmin && (
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => handleSetAll(true)}
                className="h-7 text-xs text-emerald-700 hover:bg-emerald-50 hover:text-emerald-800"
              >
                <CheckCheck className="mr-1 h-3.5 w-3.5" />
                Enable All
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => handleSetAll(false)}
                className="h-7 text-xs text-rose-700 hover:bg-rose-50 hover:text-rose-800"
              >
                <XCircle className="mr-1 h-3.5 w-3.5" />
                Disable All
              </Button>
            </div>
          )}
        </div>

        {/* Category Filters & Search */}
        <div className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap gap-1.5">
              <button
                type="button"
                onClick={() => setSelectedCategory("all")}
                className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                  selectedCategory === "all"
                    ? "bg-slate-900 text-white"
                    : "border border-slate-200 bg-white text-slate-600 hover:bg-slate-100"
                }`}
              >
                All Features ({totalCount})
              </button>
              {(Object.entries(PERMISSION_CATEGORIES) as [PermissionCategory, string][]).map(([catKey, catLabel]) => {
                const count = allEntries.filter(([, d]) => d.category === catKey).length;
                const isSelected = selectedCategory === catKey;
                return (
                  <button
                    key={catKey}
                    type="button"
                    onClick={() => setSelectedCategory(catKey)}
                    className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                      isSelected
                        ? "bg-slate-900 text-white"
                        : "border border-slate-200 bg-white text-slate-600 hover:bg-slate-100"
                    }`}
                  >
                    {catLabel} ({count})
                  </button>
                );
              })}
            </div>

            <div className="relative min-w-[220px]">
              <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-slate-400" />
              <Input
                type="text"
                placeholder="Search features..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="h-8 pl-8 text-xs"
              />
            </div>
          </div>
        </div>

        {/* Feature Toggles Grid */}
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {filteredEntries.map(([key, desc]) => {
            const enabled = activePerms[key] ?? false;
            const catStyle = CATEGORY_COLORS[desc.category] || CATEGORY_COLORS.workflow;
            return (
              <div
                key={key}
                onClick={() => !isRootAdmin && togglePermission(key)}
                className={`flex cursor-pointer select-none flex-col justify-between rounded-lg border p-3.5 transition-all ${
                  enabled
                    ? "border-[#1F70C1]/50 bg-white shadow-xs hover:border-[#1F70C1]"
                    : "border-slate-200 bg-slate-50/70 opacity-70 hover:opacity-100"
                }`}
              >
                <div>
                  <div className="flex items-center justify-between gap-2 mb-1.5">
                    <span className="text-xs font-bold text-slate-900">{desc.label}</span>
                    <span className={`rounded px-1.5 py-0.5 text-[10px] font-semibold border ${catStyle.bg} ${catStyle.text} ${catStyle.border}`}>
                      {PERMISSION_CATEGORIES[desc.category]}
                    </span>
                  </div>
                  <p className="text-[11px] leading-relaxed text-slate-500 mb-3">{desc.description}</p>
                </div>

                <div className="flex items-center justify-between border-t border-slate-100 pt-2.5">
                  <span className={`text-[11px] font-semibold ${enabled ? "text-emerald-700" : "text-slate-400"}`}>
                    {enabled ? "Enabled" : "Disabled"}
                  </span>
                  <div onClick={(e) => e.stopPropagation()}>
                    <Switch
                      checked={enabled}
                      disabled={isRootAdmin}
                      onCheckedChange={() => togglePermission(key)}
                      aria-label={desc.label}
                    />
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {filteredEntries.length === 0 && (
          <div className="py-8 text-center text-xs text-slate-500">
            No features match the filter &ldquo;{searchQuery}&rdquo;.
          </div>
        )}

        {/* Audit Reason Input & Bottom Save */}
        <div className="rounded-lg border border-slate-200 bg-white p-3 space-y-2">
          <Label htmlFor="audit_reason" className="text-xs font-medium text-slate-700">
            Audit Reason for Change (recorded in System Settings Config Audit):
          </Label>
          <div className="flex gap-2">
            <Input
              id="audit_reason"
              type="text"
              placeholder={`e.g. Configured feature matrix permissions for ${activeKey}`}
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
