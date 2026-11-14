"use client";

// Dedicated Staff & Administrative Login Portal for MSquare Professionals.
// This is an internal, private operations window for authorized personnel only.
// There is zero client-facing customer portal access on this screen.

import { useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { AlertCircle, KeyRound, Loader2, LogIn, ShieldAlert, Users, Lock } from "lucide-react";

const TEST_ACCOUNTS = [
  { label: "Root Admin (Master System Panel)", email: "admin@fitclass.dev", password: "Admin@123", role: "ROOT_ADMIN" },
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
    <div className="flex min-h-screen flex-col bg-[#0c0c10] text-[#f4f4f7] selection:bg-[#ff6b00]/30 selection:text-white">
      {/* Internal Staff Header — Pure Enterprise, No Customer Links */}
      <header className="border-b border-[#ffffff14] bg-[#13131a] px-6 py-4">
        <div className="mx-auto flex max-w-5xl items-center justify-between">
          <div className="flex items-center gap-3">
            <Image
              src="/logo.png"
              alt="MSquare Professionals"
              width={34}
              height={34}
              className="rounded-lg object-contain shadow-sm"
              priority
            />
            <div>
              <p className="text-sm font-extrabold tracking-tight text-white">MSQUARE PROFESSIONALS</p>
              <p className="text-[11px] font-semibold text-[#ff6b00] tracking-wide">ENTERPRISE OPERATIONS & WORKSPACE</p>
            </div>
          </div>
          <div className="flex items-center gap-2 rounded-full border border-[#ffffff14] bg-[#171722] px-3 py-1 text-xs font-semibold text-[#a1a1aa]">
            <Lock className="h-3 w-3 text-[#ff6b00]" />
            Restricted Access
          </div>
        </div>
      </header>

      {/* Main Staff Portal Login */}
      <main className="mx-auto flex w-full max-w-5xl flex-1 items-center justify-center px-4 py-12 sm:py-16">
        <div className="grid w-full max-w-4xl gap-8 lg:grid-cols-12">
          
          {/* Staff Login Card */}
          <div className="lg:col-span-7">
            <div className="rounded-2xl border border-[rgba(255,107,0,0.22)] bg-[#13131a] p-7 shadow-2xl backdrop-blur-md sm:p-9">
              <div className="mb-7">
                <span className="inline-flex items-center gap-1.5 rounded-full border border-[rgba(255,107,0,0.3)] bg-[rgba(255,107,0,0.08)] px-3 py-1 text-xs font-bold text-[#ff6b00]">
                  <KeyRound className="h-3.5 w-3.5 text-[#ff6b00]" />
                  Internal Staff Authentication
                </span>
                <h1 className="mt-3.5 text-2xl font-extrabold tracking-tight text-[#f4f4f7] sm:text-3xl">
                  Staff Workspace Sign In
                </h1>
                <p className="mt-2 text-xs leading-relaxed text-[#a1a1aa]">
                  Authorized personnel only. Please sign in with your corporate MSquare credentials to access ticket queues, branch assignments, and operations management.
                </p>
              </div>

              {error ? (
                <Alert variant="destructive" className="mb-5 border-red-500/30 bg-red-950/40 text-red-200">
                  <AlertCircle className="h-4 w-4" aria-hidden />
                  <AlertDescription className="text-xs">{error}</AlertDescription>
                </Alert>
              ) : null}

              <form className="space-y-4.5" onSubmit={submit}>
                <div className="space-y-2">
                  <Label htmlFor="staff-email" className="text-xs font-bold uppercase tracking-wider text-[#a1a1aa]">Corporate Email</Label>
                  <Input
                    id="staff-email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="name@msquareprofessionals.com"
                    autoComplete="username"
                    className="h-11 rounded-xl border-[#ffffff24] bg-[#171722] text-[#f4f4f7] placeholder-[#71717a] transition focus:border-[#ff6b00] focus:ring-2 focus:ring-[#ff6b00]/20"
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="staff-password" className="text-xs font-bold uppercase tracking-wider text-[#a1a1aa]">Security Password</Label>
                  <Input
                    id="staff-password"
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••••••"
                    autoComplete="current-password"
                    className="h-11 rounded-xl border-[#ffffff24] bg-[#171722] text-[#f4f4f7] placeholder-[#71717a] transition focus:border-[#ff6b00] focus:ring-2 focus:ring-[#ff6b00]/20"
                    required
                  />
                </div>

                <Button
                  type="submit"
                  disabled={busy}
                  style={{
                    background: "linear-gradient(135deg, #ff6b00, #ff7d1a)",
                    boxShadow: "0 4px 16px rgba(255, 107, 0, 0.4)",
                  }}
                  className="mt-2 h-11 w-full rounded-xl border-none text-sm font-bold tracking-wide text-white transition hover:brightness-110 active:scale-[0.99]"
                >
                  {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden /> : <LogIn className="mr-2 h-4 w-4" aria-hidden />}
                  Sign In to Dashboard
                </Button>
              </form>

              {/* Developer Test Accounts Drawer Toggle */}
              <div className="mt-7 border-t border-[#ffffff14] pt-4 text-center">
                <button
                  type="button"
                  onClick={() => setShowAccounts(!showAccounts)}
                  className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#a1a1aa] transition hover:text-[#ff6b00]"
                >
                  <Users className="h-3.5 w-3.5 text-[#ff6b00]" />
                  {showAccounts ? "Hide Test Credentials" : "Quick Fill Demo Staff Accounts"}
                </button>
              </div>
            </div>
          </div>

          {/* Side Info Panel — Security & Compliance */}
          <div className="flex flex-col justify-between space-y-6 lg:col-span-5">
            <div className="rounded-2xl border border-[#ffffff14] bg-[#13131a] p-6 shadow-xl">
              <h2 className="flex items-center gap-2.5 text-base font-bold text-white">
                <ShieldAlert className="h-5 w-5 text-[#ff6b00]" />
                Internal System Notice
              </h2>
              <p className="mt-2 text-xs leading-relaxed text-[#a1a1aa]">
                All administrative actions, status transitions, SLA closures, and ticket modifications are continuously audited with session stamps and IP tracking.
              </p>

              <div className="mt-5 space-y-3">
                <div className="flex items-start gap-2.5 text-xs text-[#d4d4d8]">
                  <span className="mt-1 h-2 w-2 rounded-full bg-[#ff6b00]" />
                  <span><strong>Operations Role Routing:</strong> Ticket assignment queues route complaints strictly within assigned branch teams.</span>
                </div>
                <div className="flex items-start gap-2.5 text-xs text-[#d4d4d8]">
                  <span className="mt-1 h-2 w-2 rounded-full bg-[#3b82f6]" />
                  <span><strong>SLA Accountability:</strong> Response deadlines and resolution checkpoints enforce client satisfaction.</span>
                </div>
                <div className="flex items-start gap-2.5 text-xs text-[#d4d4d8]">
                  <span className="mt-1 h-2 w-2 rounded-full bg-emerald-400" />
                  <span><strong>Automated Dispatch:</strong> Real-time customer notifications trigger upon status updates.</span>
                </div>
              </div>
            </div>

            {/* Test Accounts Collapsible Drawer */}
            {showAccounts ? (
              <div className="max-h-72 overflow-y-auto rounded-2xl border border-[rgba(255,107,0,0.3)] bg-[#171722] p-4 thin-scroll shadow-inner">
                <p className="mb-2.5 text-xs font-bold text-[#ff6b00]">Select an account to auto-fill:</p>
                <div className="space-y-1.5">
                  {TEST_ACCOUNTS.map((acc) => (
                    <button
                      key={acc.email}
                      type="button"
                      onClick={() => fill(acc)}
                      className="w-full rounded-xl border border-transparent bg-[#13131a] p-2.5 text-left text-xs text-[#d4d4d8] transition hover:border-[#ff6b00]/40 hover:bg-[#1c1c28]"
                    >
                      <p className="font-bold text-white">{acc.label}</p>
                      <p className="font-mono text-[11px] text-[#ff6b00]">{acc.email}</p>
                    </button>
                  ))}
                </div>
              </div>
            ) : null}

            <p className="text-center text-xs text-[#71717a] lg:text-left">
              Direct Staff Portal URL: <code className="rounded bg-[#171722] px-1.5 py-0.5 font-mono text-[#ff6b00]">/staff-login</code>
            </p>
          </div>

        </div>
      </main>

      <footer className="border-t border-[#ffffff14] bg-[#0c0c10] py-4 text-center text-xs text-[#71717a]">
        © 2026 MSquare Professionals. All rights reserved. System operations strictly monitored.
      </footer>
    </div>
  );
}
