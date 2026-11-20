"use client";

// Dedicated Staff & Administrative Login Portal for FitClass.
// Styled to match the clean, simple ServiceNow Polaris enterprise aesthetic
// used across all other panels (light canvas #F4F6F8, white card, #161F28 header, #1F70C1 corporate blue).

import { useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AlertCircle, ArrowLeft, ChevronDown, KeyRound, Loader2, LogIn, Users } from "lucide-react";

const TEST_ACCOUNTS = [
  { label: "Root Admin (System Master)", email: "admin@fitclass.dev", password: "Admin@123", role: "ROOT_ADMIN" },
  { label: "Central Operations Admin", email: "central.admin@fitclass.dev", password: "Central@123", role: "CENTRAL_ADMIN" },
  { label: "Central Operations Agent", email: "central.agent1@fitclass.dev", password: "Agent@123", role: "CENTRAL_AGENT" },
  { label: "Branch Manager — Sector 48", email: "manager.b001@fitclass.dev", password: "Manager@123", role: "BRANCH_MANAGER" },
  { label: "Support Agent — Sector 48 (A)", email: "support.b001.a@fitclass.dev", password: "Support@123", role: "SUPPORT_AGENT" },
  { label: "Branch Manager — Sector 49", email: "manager.b002@fitclass.dev", password: "Manager@123", role: "BRANCH_MANAGER" },
  { label: "Support Agent — Sector 49 (A)", email: "support.b002.a@fitclass.dev", password: "Support@123", role: "SUPPORT_AGENT" },
  { label: "Branch Manager — Gurugram Central", email: "manager.b003@fitclass.dev", password: "Manager@123", role: "BRANCH_MANAGER" },
];

export default function StaffLoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [showAccounts, setShowAccounts] = useState(false);

  async function submit(ev: React.FormEvent) {
    ev.preventDefault();
    setError("");
    if (!email.trim() || !password) {
      setError("Please enter your staff email and password.");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/v1/auth/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: email.trim(), password }),
      });
      const body = await res.json();
      if (!res.ok || !body.success) {
        setError(body.error?.message || "Invalid staff credentials.");
        return;
      }
      router.push(body.data.user.roleHome || "/staff");
      router.refresh();
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  function fill(acc: { email: string; password: string }) {
    setEmail(acc.email);
    setPassword(acc.password);
    setError("");
  }

  return (
    <div className="flex min-h-screen flex-col bg-[#f4f6f8] text-[#161f28]">
      {/* ServiceNow Polaris Header */}
      <header className="border-b border-[#2a374a] bg-[#161f28] text-white">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4 sm:px-6">
          <div className="flex items-center gap-3">
            <Image
              src="/fitclass-logo.webp"
              alt="Fitclass"
              width={120}
              height={32}
              className="h-7 w-auto object-contain"
              priority
            />
            <span className="hidden border-l border-slate-700 pl-3 text-[11px] font-bold tracking-wider text-slate-400 sm:block uppercase">
              Service Management • Workspace Auth
            </span>
          </div>

          <Link
            href="/"
            className="inline-flex items-center gap-1.5 rounded bg-[#101721] px-3 py-1.5 text-xs font-semibold text-slate-300 border border-slate-700 transition hover:border-[#1f70c1] hover:text-white"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            <span>Member Portal</span>
          </Link>
        </div>
      </header>

      {/* Main Login Canvas */}
      <main className="flex flex-1 items-center justify-center p-4 py-12 sm:py-16">
        <div className="w-full max-w-md">
          {/* Card */}
          <div className="rounded-lg border border-[#d1d7dc] bg-white p-7 shadow-xs sm:p-9 animate-fade-in">
            {/* Header */}
            <div className="text-center">
              <div className="mx-auto mb-3 flex h-11 w-11 items-center justify-center rounded-full bg-[#eef6fc] text-[#1f70c1] ring-1 ring-[#1f70c1]/20">
                <KeyRound className="h-5 w-5" />
              </div>
              <h1 className="text-xl font-bold tracking-tight text-[#161f28]">
                Staff Workspace Sign In
              </h1>
              <p className="mt-1 text-xs text-slate-500">
                Enter your credentials to access tickets, queues, and branch operations.
              </p>
            </div>

            {/* Error message */}
            {error ? (
              <div className="mt-5 flex items-center gap-2 rounded-md border border-red-200 bg-red-50 p-3 text-xs text-red-700">
                <AlertCircle className="h-4 w-4 shrink-0 text-red-600" />
                <span>{error}</span>
              </div>
            ) : null}

            {/* Form */}
            <form className="mt-6 space-y-4" onSubmit={submit}>
              <div className="space-y-1.5">
                <Label htmlFor="staff-email" className="text-xs font-semibold text-slate-700 uppercase tracking-wider">
                  Corporate Email
                </Label>
                <Input
                  id="staff-email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="name@fitclass.dev"
                  autoComplete="username"
                  className="h-9 rounded border-[#d1d7dc] bg-white text-xs text-slate-900 placeholder:text-slate-400 focus:border-[#1f70c1] focus:ring-1 focus:ring-[#1f70c1]"
                  required
                />
              </div>

              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <Label htmlFor="staff-password" className="text-xs font-semibold text-slate-700 uppercase tracking-wider">
                    Password
                  </Label>
                </div>
                <Input
                  id="staff-password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••••••"
                  autoComplete="current-password"
                  className="h-9 rounded border-[#d1d7dc] bg-white text-xs text-slate-900 placeholder:text-slate-400 focus:border-[#1f70c1] focus:ring-1 focus:ring-[#1f70c1]"
                  required
                />
              </div>

              <Button
                type="submit"
                disabled={busy}
                className="mt-2 h-10 w-full rounded bg-[#1f70c1] text-xs font-bold uppercase tracking-wider text-white transition hover:bg-[#185999] active:scale-[0.99] border-none shadow-xs"
              >
                {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <LogIn className="mr-2 h-4 w-4" />}
                Sign In
              </Button>
            </form>

            {/* Quick Fill Demo Drawer */}
            <div className="mt-6 border-t border-[#e2e8f0] pt-4 text-center">
              <button
                type="button"
                onClick={() => setShowAccounts(!showAccounts)}
                className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500 transition hover:text-[#1f70c1]"
              >
                <Users className="h-3.5 w-3.5 text-[#1f70c1]" />
                {showAccounts ? "Hide Demo Accounts" : "Quick Fill Demo Accounts"}
                <ChevronDown className={`h-3 w-3 transition-transform ${showAccounts ? "rotate-180" : ""}`} />
              </button>

              {showAccounts ? (
                <div className="mt-3 max-h-56 overflow-y-auto space-y-1.5 rounded-md border border-[#d1d7dc] bg-[#f8fafc] p-2 text-left">
                  {TEST_ACCOUNTS.map((acc) => (
                    <button
                      key={acc.email}
                      type="button"
                      onClick={() => fill(acc)}
                      className="flex w-full items-center justify-between rounded border border-transparent p-2 text-xs transition hover:border-[#d1d7dc] hover:bg-white"
                    >
                      <div className="truncate mr-2">
                        <p className="font-semibold text-slate-800 truncate">{acc.label}</p>
                        <p className="text-[11px] text-slate-500 truncate">{acc.email}</p>
                      </div>
                      <span className="shrink-0 rounded bg-[#eef6fc] px-1.5 py-0.5 text-[10px] font-bold text-[#1f70c1] border border-[#1f70c1]/20">
                        {acc.role}
                      </span>
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
          </div>

          {/* Simple footer note */}
          <p className="mt-6 text-center text-xs text-slate-400">
            FitClass Service Management · Authorized Staff Only
          </p>
        </div>
      </main>
    </div>
  );
}
