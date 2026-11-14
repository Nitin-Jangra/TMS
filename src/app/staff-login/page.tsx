"use client";

// Dedicated Staff & Administrative Login Portal for Msquare Professionals.
// This is a separate, private dashboard link for authorized staff only.
// Clients use the public Complaint workflow at /complaint and /track.

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { AlertCircle, ArrowLeft, KeyRound, Loader2, LogIn, ShieldAlert, Users } from "lucide-react";

const TEST_ACCOUNTS = [
  { label: "Root Admin (Master Admin Panel)", email: "admin@fitclass.dev", password: "Admin@123", role: "ROOT_ADMIN" },
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
    <div className="flex min-h-screen flex-col bg-[#08152c]">
      {/* Internal Staff Header */}
      <header className="border-b border-white/10 bg-[#0a2350] px-4 py-3.5">
        <div className="mx-auto flex max-w-5xl items-center justify-between">
          <div className="flex items-center gap-2.5">
            <Image src="/logo.svg" alt="Msquare logo" width={32} height={32} className="rounded-md" />
            <div>
              <p className="text-sm font-bold tracking-tight text-white">Msquare Professionals</p>
              <p className="text-[11px] font-medium text-[#72bdd0]">Staff & Operations Portal</p>
            </div>
          </div>
          <Link
            href="/"
            className="inline-flex items-center gap-1.5 rounded-md border border-white/15 px-3 py-1.5 text-xs font-medium text-blue-200 transition hover:bg-white/10 hover:text-white"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Client Care Portal
          </Link>
        </div>
      </header>

      {/* Main Login Container */}
      <main className="mx-auto flex w-full max-w-5xl flex-1 items-center justify-center px-4 py-12">
        <div className="grid w-full max-w-4xl gap-8 lg:grid-cols-12">
          
          {/* Login Card */}
          <div className="lg:col-span-7">
            <div className="rounded-2xl border border-white/15 bg-white p-7 shadow-2xl sm:p-9">
              <div className="mb-6">
                <span className="inline-flex items-center gap-1.5 rounded-full bg-blue-50 px-3 py-1 text-xs font-semibold text-[#0a2350]">
                  <KeyRound className="h-3.5 w-3.5 text-[#2c6bdf]" />
                  Internal Access Only
                </span>
                <h1 className="mt-3 text-2xl font-bold tracking-tight text-[#0a2350]">
                  Staff Portal Sign In
                </h1>
                <p className="mt-1.5 text-xs leading-relaxed text-slate-500">
                  Enter your assigned employee or administrator credentials to access your support queue. Clients do not log in — use the{" "}
                  <Link href="/track" className="font-semibold text-[#2c6bdf] hover:underline">
                    Public Ticket Tracker
                  </Link>.
                </p>
              </div>

              {error ? (
                <Alert variant="destructive" className="mb-5">
                  <AlertCircle className="h-4 w-4" aria-hidden />
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              ) : null}

              <form className="space-y-4" onSubmit={submit}>
                <div className="space-y-1.5">
                  <Label htmlFor="staff-email" className="text-xs font-bold text-slate-700">Staff Email</Label>
                  <Input
                    id="staff-email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="name@msquareprofessionals.com"
                    autoComplete="username"
                    className="h-11"
                    required
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="staff-password" className="text-xs font-bold text-slate-700">Password</Label>
                  <Input
                    id="staff-password"
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    autoComplete="current-password"
                    className="h-11"
                    required
                  />
                </div>

                <Button
                  type="submit"
                  disabled={busy}
                  className="h-11 w-full bg-[#0a2350] text-sm font-semibold hover:bg-[#12306b]"
                >
                  {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden /> : <LogIn className="mr-2 h-4 w-4" aria-hidden />}
                  Sign In to Staff Dashboard
                </Button>
              </form>

              <div className="mt-6 border-t border-slate-100 pt-4 text-center">
                <button
                  type="button"
                  onClick={() => setShowAccounts(!showAccounts)}
                  className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-500 hover:text-[#0a2350]"
                >
                  <Users className="h-3.5 w-3.5" />
                  {showAccounts ? "Hide Demo Accounts" : "Quick Fill Demo Staff Accounts"}
                </button>
              </div>
            </div>
          </div>

          {/* Info Side Panel */}
          <div className="flex flex-col justify-between space-y-6 lg:col-span-5">
            <div className="rounded-2xl border border-white/10 bg-white/5 p-6 backdrop-blur">
              <h2 className="flex items-center gap-2 text-base font-bold text-white">
                <ShieldAlert className="h-5 w-5 text-[#72bdd0]" />
                Authorized Staff Access
              </h2>
              <p className="mt-2 text-xs leading-relaxed text-blue-200">
                This dashboard is strictly for Msquare Professionals operations personnel, branch managers, and system administrators.
              </p>

              <ul className="mt-4 space-y-2 text-xs text-blue-100">
                <li className="flex items-start gap-2">
                  <span className="mt-1 h-1.5 w-1.5 rounded-full bg-[#72bdd0]" />
                  <span><strong>Role-Based Access:</strong> Root Admin, Central Support, Branch Managers, and Support Agents.</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="mt-1 h-1.5 w-1.5 rounded-full bg-[#72bdd0]" />
                  <span><strong>Round-Robin Routing:</strong> Inbound complaints automatically route to active branch staff.</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="mt-1 h-1.5 w-1.5 rounded-full bg-[#72bdd0]" />
                  <span><strong>SLA Compliance:</strong> Automated escalations when resolution deadlines are approaching.</span>
                </li>
              </ul>
            </div>

            {/* Collapsible Demo Accounts Quick Fill */}
            {showAccounts ? (
              <div className="max-h-72 overflow-y-auto rounded-2xl border border-white/10 bg-white/10 p-4">
                <p className="mb-2.5 text-xs font-bold text-white">Select a test account to auto-fill:</p>
                <div className="space-y-1.5">
                  {TEST_ACCOUNTS.map((acc) => (
                    <button
                      key={acc.email}
                      type="button"
                      onClick={() => fill(acc)}
                      className="w-full rounded-lg bg-white/5 p-2 text-left text-xs text-blue-100 transition hover:bg-white/15"
                    >
                      <p className="font-semibold text-white">{acc.label}</p>
                      <p className="font-mono text-[11px] text-blue-200">{acc.email} / {acc.password}</p>
                    </button>
                  ))}
                </div>
              </div>
            ) : null}

            <p className="text-center text-xs text-blue-300/60 lg:text-left">
              Staff URL: <code className="rounded bg-white/10 px-1.5 py-0.5 text-blue-200">/staff-login</code> or <code className="rounded bg-white/10 px-1.5 py-0.5 text-blue-200">/portal</code>
            </p>
          </div>

        </div>
      </main>

      <footer className="border-t border-white/10 bg-[#061226] py-4 text-center text-xs text-blue-300/60">
        © 2026 Msquare Professionals. All internal operations monitored & audited.
      </footer>
    </div>
  );
}
