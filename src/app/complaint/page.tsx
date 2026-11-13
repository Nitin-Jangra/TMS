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
    <div className="flex min-h-screen flex-col">
      <SiteHeader />
      <main className="mx-auto w-full max-w-2xl flex-1 px-4 py-8">
        <div className="brand-ring rounded-xl border border-slate-200 bg-white p-6">
          <h1 className="text-xl font-bold text-[#0a2350]">Register a complaint</h1>
          <p className="mt-1 text-sm text-slate-500">
            All fields are mandatory unless marked optional. You will receive a ticket number
            like <span className="font-mono text-xs text-slate-600">FC-2026-000123</span> right away.
          </p>

          {topError ? (
            <Alert variant="destructive" className="mt-4">
              <AlertCircle className="h-4 w-4" aria-hidden />
              <AlertDescription>{topError}</AlertDescription>
            </Alert>
          ) : null}

          <form className="mt-5 space-y-4" onSubmit={onSubmit} noValidate>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="customerName">Customer Name</Label>
                <Input id="customerName" value={form.customerName} onChange={(e) => set("customerName", e.target.value)} placeholder="e.g. Rahul Khanna" aria-invalid={!!errors.customerName} />
                {errors.customerName ? <p className="text-xs text-red-600">{errors.customerName}</p> : null}
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="customerPhone">Mobile Number</Label>
                <Input id="customerPhone" inputMode="tel" value={form.customerPhone} onChange={(e) => set("customerPhone", e.target.value)} placeholder="10-digit mobile number" aria-invalid={!!errors.customerPhone} />
                {errors.customerPhone ? <p className="text-xs text-red-600">{errors.customerPhone}</p> : null}
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="customerEmail">Email Address</Label>
              <Input id="customerEmail" type="email" value={form.customerEmail} onChange={(e) => set("customerEmail", e.target.value)} placeholder="you@example.com" aria-invalid={!!errors.customerEmail} />
              {errors.customerEmail ? <p className="text-xs text-red-600">{errors.customerEmail}</p> : null}
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>Branch</Label>
                {branches === null ? (
                  <Skeleton className="h-9 w-full" />
                ) : (
                  <Select value={form.branchId} onValueChange={(v) => set("branchId", v)}>
                    <SelectTrigger aria-label="Select branch" aria-invalid={!!errors.branchId}>
                      <SelectValue placeholder="Select your branch" />
                    </SelectTrigger>
                    <SelectContent>
                      {branches.map((b) => (
                        <SelectItem key={b.id} value={b.id}>
                          {b.name} {b.city ? `(${b.city})` : ""}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
                {errors.branchId ? <p className="text-xs text-red-600">{errors.branchId}</p> : null}
              </div>
              <div className="space-y-1.5">
                <Label>Complaint Category</Label>
                {categories === null ? (
                  <Skeleton className="h-9 w-full" />
                ) : (
                  <Select value={form.categoryId} onValueChange={(v) => set("categoryId", v)}>
                    <SelectTrigger aria-label="Select complaint category" aria-invalid={!!errors.categoryId}>
                      <SelectValue placeholder="Select category" />
                    </SelectTrigger>
                    <SelectContent>
                      {categories.map((c) => (
                        <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
                {errors.categoryId ? <p className="text-xs text-red-600">{errors.categoryId}</p> : null}
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="description">Complaint Description</Label>
              <Textarea id="description" rows={5} value={form.description} onChange={(e) => set("description", e.target.value)} placeholder="Tell us what happened, when and where. Include any relevant details." aria-invalid={!!errors.description} />
              {errors.description ? <p className="text-xs text-red-600">{errors.description}</p> : null}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="attachment" className="flex items-center gap-1.5">
                <Paperclip className="h-3.5 w-3.5 text-slate-400" aria-hidden />
                Attachment <span className="font-normal text-slate-400">(optional)</span>
              </Label>
              <Input id="attachment" ref={attachmentRef} type="file" accept="image/png,image/jpeg,image/webp,application/pdf" className="file:mr-3 file:rounded-md file:border-0 file:bg-slate-100 file:px-3 file:py-1 file:text-xs file:font-medium" />
              <p className="text-xs text-slate-400">Images (png/jpg/webp) or PDF, up to 10 MB.</p>
            </div>

            <div className="rounded-lg bg-slate-50 p-3">
              <label className="flex items-start gap-2.5 text-sm" htmlFor="privacyConsent">
                <Checkbox
                  id="privacyConsent"
                  checked={form.privacyConsent}
                  onCheckedChange={(v) => set("privacyConsent", v === true)}
                  className="mt-0.5"
                />
                <span className="leading-relaxed text-slate-600">
                  I consent to FitClass storing and using these details to investigate and resolve my
                  complaint. I understand my mobile number will be used to verify tracking access.
                </span>
              </label>
              {errors.privacyConsent ? <p className="mt-1.5 pl-8 text-xs text-red-600">{errors.privacyConsent}</p> : null}
            </div>

            <Button type="submit" disabled={submitting} className="w-full bg-[#0a2350] hover:bg-[#10306b] sm:w-auto">
              {submitting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />
                  Registering...
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
