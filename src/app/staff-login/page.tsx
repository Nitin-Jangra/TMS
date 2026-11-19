"use client";

// Dedicated Staff & Administrative Login Portal for FitClass.
// Redesigned with ServiceNow Next Experience (Polaris) enterprise authentication style.
// Strictly internal: zero customer-portal links.

import { useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { AlertCircle, KeyRound, Loader2, LogIn, ShieldAlert, Users, Lock, ChevronDown, CheckCircle2 } from "lucide-react";

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
    <div className="flex min-h-screen flex-col bg-[#0f161e] text-[#f4f6f8]">
      {/* ServiceNow Polaris Header */}
      <header className="border-b border-[#2a374a] bg-[#161f28] px-6 py-3.5 shadow-sm">
        <div className="mx-auto flex max-w-5xl items-center justify-between">
          <div className="flex items-center gap-3">
            <Image
              src="/fitclass-logo.webp"
              alt="Fitclass Logo"
              width={130}
              height={34}
              className="h-8 w-auto object-contain"
              priority
            />
            <span className="hidden border-l border-slate-700 pl-3 text-[11px] font-bold tracking-wider text-slate-400 sm:block">
              SERVICENOW NEXT EXPERIENCE • WORKSPACE AUTH
            </span>
          </div>
          <div className="flex items-center gap-2 rounded bg-[#101721] px-2.5 py-1 text-xs font-semibold text-slate-300 border border-slate-700">
            <Lock className="h-3 w-3 text-[#30c497]" />
            Restricted Operator Access
          </div>
        </div>
      </header>

      {/* Main Container */}
      <main className="mx-auto flex w-full max-w-5xl flex-1 items-center justify-center px-4 py-12 sm:py-16">
        <div className="grid w-full max-w-4xl gap-8 lg:grid-cols-12">
          {/* Staff Login Card */}
          <div className="lg:col-span-7">
            <div className="rounded border border-[#2a374a] bg-[#182230] p-7 shadow-xl sm:p-9">
              <div className="mb-6">
                <span className="inline-flex items-center gap-1.5 rounded bg-[#1f70c1]/20 px-2.5 py-0.5 text-xs font-semibold text-[#60a5fa] border border-[#1f70c1]/40">
                  <KeyRound className="h-3.5 w-3.5 text-[#38bdf8]" />
                  ITIL Service Operations
                </span>
                <h1 className="mt-3 text-xl font-bold tracking-tight text-white sm:text-2xl">
                  Agent Workspace Sign In
                </h1>
                <p className="mt-1.5 text-xs text-slate-400">
                  Enter your assigned credentials to access ticket queues, branch round-robin assignments, and incident lifecycle management.
                </p>
              </div>

              {error ? (
                <Alert variant="destructive" className="mb-5 border-red-500/30 bg-red-950/40 text-red-200">
                  <AlertCircle className="h-4 w-4" aria-hidden />
                  <AlertDescription className="text-xs">{error}</AlertDescription>
                </Alert>
              ) : null}

              <form className="space-y-4" onSubmit={submit}>
                <div className="space-y-1.5">
                  <Label htmlFor="staff-email" className="text-xs font-semibold uppercase tracking-wider text-slate-300">
                    Corporate Email / User ID
                  </Label>
                  <Input
                    id="staff-email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="name@fitclass.dev"
                    autoComplete="username"
                    className="h-10 rounded border-[#2a374a] bg-[#101721] text-xs text-slate-100 placeholder-slate-500 transition focus:border-[#1f70c1] focus:ring-1 focus:ring-[#1f70c1]"
                    required
                  />
                </div>

                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="staff-password" className="text-xs font-semibold uppercase tracking-wider text-slate-300">
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
                    className="h-10 rounded border-[#2a374a] bg-[#101721] text-xs text-slate-100 placeholder-slate-500 transition focus:border-[#1f70c1] focus:ring-1 focus:ring-[#1f70c1]"
                    required
                  />
                </div>

                <Button
                  type="submit"
                  disabled={busy}
                  className="mt-3 h-10 w-full rounded bg-[#1f70c1] text-xs font-bold uppercase tracking-wider text-white transition hover:bg-[#155799] active:scale-[0.99] border-none shadow-sm"
                >
                  {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden /> : <LogIn className="mr-2 h-4 w-4" aria-hidden />}
                  Authenticate & Launch Workspace
                </Button>
              </form>

              {/* Quick Fill Demo Drawer */}
              <div className="mt-6 border-t border-[#2a374a] pt-4 text-center">
                <button
                  type="button"
                  onClick={() => setShowAccounts(!showAccounts)}
                  className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-400 transition hover:text-[#60a5fa]"
                >
                  <Users className="h-3.5 w-3.5 text-[#38bdf8]" />
                  {showAccounts ? "Hide Test Credentials" : "Quick Fill Demo Accounts (ServiceNow Roles)"}
                  <ChevronDown className={`h-3 w-3 transition-transform ${showAccounts ? "rotate-180" : ""}`} />
                </button>

                {showAccounts ? (
                  <div className="mt-4 grid gap-2 text-left">
                    {TEST_ACCOUNTS.map((acc) => (
                      <button
                        key={acc.email}
                        type="button"
                        onClick={() => fill(acc)}
                        className="flex items-center justify-between rounded border border-[#2a374a] bg-[#101721] p-2.5 text-xs transition hover:border-[#1f70c1] hover:bg-[#162130]"
                      >
                        <div>
                          <p className="font-semibold text-slate-200">{acc.label}</p>
                          <p className="text-[11px] text-slate-400">{acc.email}</p>
                        </div>
                        <span className="rounded bg-[#1f70c1]/20 px-2 py-0.5 text-[10px] font-bold text-[#60a5fa] border border-[#1f70c1]/40">
                          {acc.role}
                        </span>
                      </button>
                    ))}
                  </div>
                ) : null}
              </div>
            </div>
          </div>

          {/* Right Security & System Notice */}
          <div className="flex flex-col justify-between space-y-6 lg:col-span-5">
            <div className="rounded border border-[#2a374a] bg-[#182230] p-6 shadow-xl">
              <h2 className="flex items-center gap-2 text-sm font-bold text-white">
                <ShieldAlert className="h-4 w-4 text-[#38bdf8]" />
                Security & Role Compliance
              </h2>
              <p className="mt-2 text-xs leading-relaxed text-slate-400">
                All logins and status changes are audited with client IP, timestamp, and actor identity. Closed tickets are strictly immutable in compliance with ITIL standards.
              </p>

              <div className="mt-4 space-y-2 border-t border-[#2a374a] pt-3 text-xs text-slate-400">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="h-3.5 w-3.5 text-[#30c497]" />
                  <span>Interactive SLA Countdown Enforcement</span>
                </div>
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="h-3.5 w-3.5 text-[#30c497]" />
                  <span>34 Branch Scoped Queue Routing</span>
                </div>
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="h-3.5 w-3.5 text-[#30c497]" />
                  <span>Dual-Channel Work Notes & Audit Logs</span>
                </div>
              </div>
            </div>

            <div className="rounded border border-[#2a374a] bg-[#101721] p-4 text-[11px] text-slate-500">
              <p className="font-semibold text-slate-400">Looking for Client Self-Service?</p>
              <p className="mt-0.5">End-users register and track complaints without logging in via the public Service Portal.</p>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
