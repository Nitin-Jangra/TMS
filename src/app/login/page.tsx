"use client";

// Staff login with development test credentials (dummy environment only).
// Production replaces password auth with the FitClass CRM adapter.

import { useState } from "react";
import { useRouter } from "next/navigation";
import { SiteFooter, SiteHeader } from "@/components/site-chrome";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { AlertCircle, Info, Loader2, LogIn } from "lucide-react";

const TEST_ACCOUNTS = [
  { label: "Root Admin (Master panel)", email: "admin@fitclass.dev", password: "Admin@123" },
  { label: "Central Support Admin", email: "central.admin@fitclass.dev", password: "Central@123" },
  { label: "Central Support Agent", email: "central.agent1@fitclass.dev", password: "Agent@123" },
  { label: "Manager — Sector 48", email: "manager.b001@fitclass.dev", password: "Manager@123" },
  { label: "Support — Sector 48 (A)", email: "support.b001.a@fitclass.dev", password: "Support@123" },
  { label: "Support — Sector 48 (B)", email: "support.b001.b@fitclass.dev", password: "Support@123" },
  { label: "Support — Sector 48 (C)", email: "support.b001.c@fitclass.dev", password: "Support@123" },
  { label: "Manager — Sector 49", email: "manager.b002@fitclass.dev", password: "Manager@123" },
  { label: "Support — Sector 49 (A)", email: "support.b002.a@fitclass.dev", password: "Support@123" },
  { label: "Support — Sector 49 (B, availability OFF)", email: "support.b002.b@fitclass.dev", password: "Support@123" },
  { label: "Manager — Gurugram Central", email: "manager.b003@fitclass.dev", password: "Manager@123" },
  { label: "Support — Gurugram Central", email: "support.b003.a@fitclass.dev", password: "Support@123" },
  { label: "Manager — Sohna Road (no agents)", email: "manager.b004@fitclass.dev", password: "Manager@123" },
];

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(ev: React.FormEvent) {
    ev.preventDefault();
    setError("");
    if (!email.trim() || !password) {
      setError("Enter your email and password.");
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
        setError(body.error?.message || "Login failed.");
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
    <div className="flex min-h-screen flex-col">
      <SiteHeader />
      <main className="mx-auto grid w-full max-w-4xl flex-1 gap-6 px-4 py-8 lg:grid-cols-2">
        <div className="brand-ring rounded-xl border border-slate-200 bg-white p-6">
          <h1 className="text-xl font-bold text-[#0a2350]">Staff sign in</h1>
          <p className="mt-1 text-sm text-slate-500">
            Access your support dashboard. Customers do not need an account — use{" "}
            <a href="/track" className="text-[#2c6bdf] hover:underline">Track Complaint</a> instead.
          </p>

          {error ? (
            <Alert variant="destructive" className="mt-4">
              <AlertCircle className="h-4 w-4" aria-hidden />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          ) : null}

          <form className="mt-5 space-y-4" onSubmit={submit}>
            <div className="space-y-1.5">
              <Label htmlFor="email">Email</Label>
              <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@fitclass.dev" autoComplete="username" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="password">Password</Label>
              <Input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" autoComplete="current-password" />
            </div>
            <Button type="submit" disabled={busy} className="w-full bg-[#0a2350] hover:bg-[#10306b]">
              {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden /> : <LogIn className="mr-2 h-4 w-4" aria-hidden />}
              Sign in
            </Button>
          </form>
        </div>

        <aside className="rounded-xl border border-slate-200 bg-slate-50 p-6">
          <p className="flex items-center gap-1.5 text-sm font-semibold text-[#0a2350]">
            <Info className="h-4 w-4 text-[#2c6bdf]" aria-hidden />
            Development test accounts
          </p>
          <p className="mt-1 text-xs leading-relaxed text-slate-500">
            Dummy data environment for login testing. Support profiles exist in Sector 48, Sector 49
            and Gurugram Central; Sohna Road has no support agents (demonstrates the unassigned queue).
          </p>
          <div className="thin-scroll mt-4 max-h-[420px] space-y-1.5 overflow-y-auto pr-1" role="list">
            {TEST_ACCOUNTS.map((acc) => (
              <button
                key={acc.email}
                type="button"
                onClick={() => fill(acc)}
                className="flex w-full flex-col items-start rounded-md border border-slate-200 bg-white px-3 py-2 text-left transition hover:border-[#2c6bdf]/50 hover:bg-[#eaf1fb]/60"
                aria-label={`Use credentials for ${acc.label}`}
              >
                <span className="text-xs font-medium text-[#0a2350]">{acc.label}</span>
                <span className="font-mono text-[11px] text-slate-500">{acc.email} · {acc.password}</span>
              </button>
            ))}
          </div>
        </aside>
      </main>
      <SiteFooter />
    </div>
  );
}
