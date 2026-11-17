"use client";

// Customer complaint registration form. Fields per spec section 5:
// name, mobile, email, branch (dynamic), category (dynamic), description,
// optional attachment, mandatory privacy consent. Idempotency key prevents
// duplicate submissions.

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { SiteFooter, SiteHeader } from "@/components/site-chrome";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import { AlertCircle, Loader2, Paperclip, Send } from "lucide-react";

interface BranchOption { id: string; code: string; name: string; city: string | null }
interface CategoryOption { id: string; name: string }

const EMPTY_FORM = {
  customerName: "",
  customerPhone: "",
  customerEmail: "",
  branchId: "",
  categoryId: "",
  description: "",
  privacyConsent: false,
};

export default function ComplaintPage() {
  const router = useRouter();
  const [form, setForm] = useState(EMPTY_FORM);
  const [branches, setBranches] = useState<BranchOption[] | null>(null);
  const [categories, setCategories] = useState<CategoryOption[] | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [topError, setTopError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const attachmentRef = useRef<HTMLInputElement>(null);
  const idempotencyKey = useRef(`portal-${Date.now()}-${Math.random().toString(36).slice(2)}`);

  useEffect(() => {
    fetch("/api/v1/public/branches").then((r) => r.json()).then((d) => setBranches(d.data?.branches ?? [])).catch(() => setBranches([]));
    fetch("/api/v1/public/categories").then((r) => r.json()).then((d) => setCategories(d.data?.categories ?? [])).catch(() => setCategories([]));
  }, []);

  const set = (key: keyof typeof EMPTY_FORM, value: string | boolean) => {
    setForm((f) => ({ ...f, [key]: value }));
    setErrors((e) => ({ ...e, [key]: "" }));
  };

  function validate(): boolean {
    const e: Record<string, string> = {};
    if (form.customerName.trim().length < 2) e.customerName = "Please enter your full name.";
    if (!/^\d{10,12}$/.test(form.customerPhone.replace(/\D/g, ""))) e.customerPhone = "Enter a valid 10-12 digit mobile number.";
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.customerEmail)) e.customerEmail = "Enter a valid email address.";
    if (!form.branchId) e.branchId = "Select your branch.";
    if (!form.categoryId) e.categoryId = "Select a complaint category.";
    if (form.description.trim().length < 10) e.description = "Please describe your complaint (minimum 10 characters).";
    if (!form.privacyConsent) e.privacyConsent = "Privacy consent is required.";
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  async function onSubmit(ev: React.FormEvent) {
    ev.preventDefault();
    setTopError("");
    if (!validate()) return;
    setSubmitting(true);
    try {
      const res = await fetch("/api/v1/public/complaints", {
        method: "POST",
        headers: { "content-type": "application/json", "idempotency-key": idempotencyKey.current },
        body: JSON.stringify(form),
      });
      const body = await res.json();
      if (!res.ok || !body.success) {
        if (body.error?.code === "VALIDATION_ERROR" && body.error.details) {
          setErrors(body.error.details);
          setTopError("Please correct the highlighted fields.");
        } else {
          setTopError(body.error?.message || "Something went wrong. Please try again.");
        }
        return;
      }
      const ticketNumber = body.data.ticketNumber as string;
      // Optional attachment upload (non-blocking failure)
      const file = attachmentRef.current?.files?.[0];
      if (file) {
        const fd = new FormData();
        fd.append("ticketNumber", ticketNumber);
        fd.append("mobileNumber", form.customerPhone);
        fd.append("file", file);
        await fetch("/api/v1/public/tickets/attachments", { method: "POST", body: fd }).catch(() => undefined);
      }
      router.push(`/complaint/success?ticket=${encodeURIComponent(ticketNumber)}`);
    } catch {
      setTopError("Network error. Please check your connection and try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex min-h-screen flex-col bg-[#0c0c10] text-[#f4f4f7] selection:bg-[#22618b]/30 selection:text-white">
      <SiteHeader />
      <main className="mx-auto w-full max-w-2xl flex-1 px-4 py-10 sm:py-12">
        <div className="rounded-2xl border border-[#ffffff14] bg-[#13131a] p-7 shadow-2xl sm:p-9">
          <div className="mb-6">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-[rgba(114, 189, 208,0.3)] bg-[rgba(114, 189, 208,0.08)] px-3 py-1 text-xs font-bold text-[#72bdd0]">
              FitClass Member Support
            </span>
            <h1 className="mt-3 text-2xl font-extrabold tracking-tight text-white sm:text-3xl">Register a Complaint</h1>
            <p className="mt-1.5 text-xs text-[#a1a1aa] sm:text-sm">
              All fields are required unless marked optional. You will receive an official ticket number
              like <span className="font-mono font-bold text-[#72bdd0]">FC-2026-000123</span> immediately with automated email alerts.
            </p>
          </div>

          {topError ? (
            <Alert variant="destructive" className="mb-6 border-red-500/30 bg-red-950/40 text-red-200">
              <AlertCircle className="h-4 w-4" aria-hidden />
              <AlertDescription className="text-xs">{topError}</AlertDescription>
            </Alert>
          ) : null}

          <form className="space-y-5" onSubmit={onSubmit} noValidate>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="customerName" className="text-xs font-bold uppercase tracking-wider text-[#a1a1aa]">Your Full Name</Label>
                <Input
                  id="customerName"
                  value={form.customerName}
                  onChange={(e) => set("customerName", e.target.value)}
                  placeholder="e.g. Rahul Khanna"
                  className="h-11 rounded-xl border-[#ffffff1f] bg-[#171722] text-[#f4f4f7] placeholder-[#71717a] focus:border-[#72bdd0]"
                  aria-invalid={!!errors.customerName}
                />
                {errors.customerName ? <p className="text-xs text-red-400">{errors.customerName}</p> : null}
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="customerPhone" className="text-xs font-bold uppercase tracking-wider text-[#a1a1aa]">Mobile Number</Label>
                <Input
                  id="customerPhone"
                  inputMode="tel"
                  value={form.customerPhone}
                  onChange={(e) => set("customerPhone", e.target.value)}
                  placeholder="10-digit mobile number"
                  className="h-11 rounded-xl border-[#ffffff1f] bg-[#171722] text-[#f4f4f7] placeholder-[#71717a] focus:border-[#72bdd0]"
                  aria-invalid={!!errors.customerPhone}
                />
                {errors.customerPhone ? <p className="text-xs text-red-400">{errors.customerPhone}</p> : null}
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="customerEmail" className="text-xs font-bold uppercase tracking-wider text-[#a1a1aa]">Email Address (for resolution alerts)</Label>
              <Input
                id="customerEmail"
                type="email"
                value={form.customerEmail}
                onChange={(e) => set("customerEmail", e.target.value)}
                placeholder="you@example.com"
                className="h-11 rounded-xl border-[#ffffff1f] bg-[#171722] text-[#f4f4f7] placeholder-[#71717a] focus:border-[#72bdd0]"
                aria-invalid={!!errors.customerEmail}
              />
              {errors.customerEmail ? <p className="text-xs text-red-400">{errors.customerEmail}</p> : null}
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label className="text-xs font-bold uppercase tracking-wider text-[#a1a1aa]">Branch / Location</Label>
                {branches === null ? (
                  <Skeleton className="h-11 w-full rounded-xl bg-[#171722]" />
                ) : (
                  <Select value={form.branchId} onValueChange={(v) => set("branchId", v)}>
                    <SelectTrigger className="h-11 rounded-xl border-[#ffffff1f] bg-[#171722] text-[#f4f4f7] focus:border-[#72bdd0]" aria-label="Select branch" aria-invalid={!!errors.branchId}>
                      <SelectValue placeholder="Select your branch" />
                    </SelectTrigger>
                    <SelectContent className="border-[#ffffff1f] bg-[#13131a] text-[#f4f4f7]">
                      {branches.map((b) => (
                        <SelectItem key={b.id} value={b.id} className="focus:bg-[#1c1c28] focus:text-[#72bdd0]">
                          {b.name} {b.city ? `(${b.city})` : ""}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
                {errors.branchId ? <p className="text-xs text-red-400">{errors.branchId}</p> : null}
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-bold uppercase tracking-wider text-[#a1a1aa]">Complaint Category</Label>
                {categories === null ? (
                  <Skeleton className="h-11 w-full rounded-xl bg-[#171722]" />
                ) : (
                  <Select value={form.categoryId} onValueChange={(v) => set("categoryId", v)}>
                    <SelectTrigger className="h-11 rounded-xl border-[#ffffff1f] bg-[#171722] text-[#f4f4f7] focus:border-[#72bdd0]" aria-label="Select complaint category" aria-invalid={!!errors.categoryId}>
                      <SelectValue placeholder="Select category" />
                    </SelectTrigger>
                    <SelectContent className="border-[#ffffff1f] bg-[#13131a] text-[#f4f4f7]">
                      {categories.map((c) => (
                        <SelectItem key={c.id} value={c.id} className="focus:bg-[#1c1c28] focus:text-[#72bdd0]">{c.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
                {errors.categoryId ? <p className="text-xs text-red-400">{errors.categoryId}</p> : null}
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="description" className="text-xs font-bold uppercase tracking-wider text-[#a1a1aa]">Complaint Description</Label>
              <Textarea
                id="description"
                rows={5}
                value={form.description}
                onChange={(e) => set("description", e.target.value)}
                placeholder="Tell us what happened, when and where. Include any relevant details..."
                className="rounded-xl border-[#ffffff1f] bg-[#171722] text-[#f4f4f7] placeholder-[#71717a] focus:border-[#72bdd0]"
                aria-invalid={!!errors.description}
              />
              {errors.description ? <p className="text-xs text-red-400">{errors.description}</p> : null}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="attachment" className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-[#a1a1aa]">
                <Paperclip className="h-3.5 w-3.5 text-[#72bdd0]" aria-hidden />
                Attachment <span className="font-normal lowercase text-[#71717a]">(optional)</span>
              </Label>
              <Input
                id="attachment"
                ref={attachmentRef}
                type="file"
                accept="image/png,image/jpeg,image/webp,application/pdf"
                className="h-11 rounded-xl border-[#ffffff1f] bg-[#171722] text-xs text-[#a1a1aa] file:mr-3 file:rounded-lg file:border-0 file:bg-[#252538] file:px-3 file:py-1 file:text-xs file:font-semibold file:text-[#f4f4f7]"
              />
              <p className="text-[11px] text-[#71717a]">Images (png/jpg/webp) or PDF, up to 10 MB.</p>
            </div>

            <div className="rounded-xl border border-[#ffffff14] bg-[#171722] p-4">
              <label className="flex items-start gap-3 text-xs leading-relaxed text-[#d4d4d8] cursor-pointer" htmlFor="privacyConsent">
                <Checkbox
                  id="privacyConsent"
                  checked={form.privacyConsent}
                  onCheckedChange={(v) => set("privacyConsent", v === true)}
                  className="mt-0.5 border-[#ffffff33] data-[state=checked]:bg-[#22618b] data-[state=checked]:border-[#72bdd0]"
                />
                <span>
                  I consent to FitClass storing and using these details to investigate and resolve my
                  complaint. I understand my mobile number and email will be used to verify tracking access and send status updates.
                </span>
              </label>
              {errors.privacyConsent ? <p className="mt-2 pl-7 text-xs text-red-400">{errors.privacyConsent}</p> : null}
            </div>

            <Button
              type="submit"
              disabled={submitting}
              style={{
                background: "linear-gradient(135deg, #22618b, #1a4c6e)",
                boxShadow: "0 4px 18px rgba(114, 189, 208, 0.4)",
              }}
              className="h-12 w-full rounded-xl border-none text-sm font-extrabold tracking-wide text-white transition hover:brightness-110 active:scale-[0.99] sm:w-auto sm:px-8"
            >
              {submitting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />
                  Registering Ticket...
                </>
              ) : (
                <>
                  <Send className="mr-2 h-4 w-4" aria-hidden />
                  Submit Complaint
                </>
              )}
            </Button>
          </form>
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}
