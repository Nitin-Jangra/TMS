"use client";

// Customer complaint registration form. Fields per spec section 5:
// name, mobile, email, branch (dynamic), category (dynamic), description,
// optional attachment, mandatory privacy consent. Idempotency key prevents
// duplicate submissions.
// ServiceNow Service Portal / Employee Center Record Producer UI.

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { SiteFooter, SiteHeader } from "@/components/site-chrome";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import { AlertCircle, ChevronRight, FileText, HelpCircle, Info, Loader2, Paperclip, Send, ShieldCheck } from "lucide-react";

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
    <div className="flex min-h-screen flex-col bg-[#F4F6F8] text-[#1E293B] selection:bg-[#1F70C1]/20 selection:text-[#1F70C1]">
      <SiteHeader />

      <main className="mx-auto w-full max-w-4xl flex-1 px-4 py-8 sm:py-10">
        {/* ServiceNow Breadcrumb Trail */}
        <div className="mb-6 flex items-center gap-2 text-xs font-medium text-slate-500">
          <Link href="/" className="hover:text-[#1F70C1] transition-colors">Employee Center</Link>
          <ChevronRight className="h-3 w-3 text-slate-400" />
          <Link href="/" className="hover:text-[#1F70C1] transition-colors">Service Catalog</Link>
          <ChevronRight className="h-3 w-3 text-slate-400" />
          <span className="text-slate-900 font-semibold">Incident Record Producer</span>
        </div>

        {/* Record Producer Container */}
        <div className="overflow-hidden rounded-xl border border-[#D1D7DC] bg-white shadow-sm">
          {/* Header Banner */}
          <div className="border-b border-[#D1D7DC] bg-[#FAFBFC] p-6 sm:p-7">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-[#EBF4FA] text-[#00639B] border border-[#0084D1]/20">
                  <FileText className="h-5 w-5" />
                </span>
                <div>
                  <div className="flex items-center gap-2">
                    <h1 className="text-xl font-bold tracking-tight text-slate-900 sm:text-2xl">
                      Report an Issue or Complaint
                    </h1>
                    <span className="hidden sm:inline-flex items-center rounded-full bg-[#EBF4FA] px-2.5 py-0.5 text-[11px] font-bold text-[#00639B] border border-[#0084D1]/20">
                      Standard ITIL Intake
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-slate-600 sm:text-sm">
                    Submit an official request to your branch management team. Tickets are automatically tracked against strict SLAs.
                  </p>
                </div>
              </div>
            </div>
          </div>

          <div className="p-6 sm:p-8">
            {topError ? (
              <Alert variant="destructive" className="mb-6 border-red-200 bg-red-50 text-red-800">
                <AlertCircle className="h-4 w-4 text-red-600" aria-hidden />
                <AlertDescription className="text-xs font-medium">{topError}</AlertDescription>
              </Alert>
            ) : null}

            <form onSubmit={onSubmit} noValidate className="space-y-7">
              {/* SECTION 1: Requester Information */}
              <div className="rounded-lg border border-[#E2E8F0] bg-[#FAFBFC] p-5">
                <div className="mb-4 flex items-center justify-between border-b border-[#E2E8F0] pb-2.5">
                  <h2 className="text-xs font-bold uppercase tracking-wider text-slate-700">
                    1. Requester Information
                  </h2>
                  <span className="text-[11px] text-slate-500 font-medium">* Required for ticket dispatch</span>
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label htmlFor="customerName" className="text-[11px] font-bold uppercase tracking-wider text-slate-600">
                      Full Name <span className="text-red-500">*</span>
                    </Label>
                    <Input
                      id="customerName"
                      value={form.customerName}
                      onChange={(e) => set("customerName", e.target.value)}
                      placeholder="e.g. Rahul Sharma"
                      className="h-10 rounded-md border-[#D1D7DC] bg-white text-sm text-slate-900 placeholder:text-slate-400 focus:border-[#1F70C1] focus:ring-1 focus:ring-[#1F70C1]"
                      aria-invalid={!!errors.customerName}
                    />
                    {errors.customerName ? <p className="text-xs text-red-600 font-medium">{errors.customerName}</p> : null}
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="customerPhone" className="text-[11px] font-bold uppercase tracking-wider text-slate-600">
                      Mobile Number <span className="text-red-500">*</span>
                    </Label>
                    <Input
                      id="customerPhone"
                      inputMode="tel"
                      value={form.customerPhone}
                      onChange={(e) => set("customerPhone", e.target.value)}
                      placeholder="10-digit mobile number"
                      className="h-10 rounded-md border-[#D1D7DC] bg-white text-sm text-slate-900 placeholder:text-slate-400 focus:border-[#1F70C1] focus:ring-1 focus:ring-[#1F70C1]"
                      aria-invalid={!!errors.customerPhone}
                    />
                    {errors.customerPhone ? <p className="text-xs text-red-600 font-medium">{errors.customerPhone}</p> : null}
                  </div>
                </div>

                <div className="mt-4 space-y-1.5">
                  <Label htmlFor="customerEmail" className="text-[11px] font-bold uppercase tracking-wider text-slate-600">
                    Email Address (for resolution alerts & audit updates) <span className="text-red-500">*</span>
                  </Label>
                  <Input
                    id="customerEmail"
                    type="email"
                    value={form.customerEmail}
                    onChange={(e) => set("customerEmail", e.target.value)}
                    placeholder="name@example.com"
                    className="h-10 rounded-md border-[#D1D7DC] bg-white text-sm text-slate-900 placeholder:text-slate-400 focus:border-[#1F70C1] focus:ring-1 focus:ring-[#1F70C1]"
                    aria-invalid={!!errors.customerEmail}
                  />
                  {errors.customerEmail ? <p className="text-xs text-red-600 font-medium">{errors.customerEmail}</p> : null}
                </div>
              </div>

              {/* SECTION 2: Incident Details & Routing */}
              <div className="rounded-lg border border-[#E2E8F0] bg-[#FAFBFC] p-5">
                <div className="mb-4 flex items-center justify-between border-b border-[#E2E8F0] pb-2.5">
                  <h2 className="text-xs font-bold uppercase tracking-wider text-slate-700">
                    2. Classification & Routing
                  </h2>
                  <span className="text-[11px] text-slate-500 font-medium">Auto-dispatches to branch queue</span>
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label className="text-[11px] font-bold uppercase tracking-wider text-slate-600">
                      Branch / Center Location <span className="text-red-500">*</span>
                    </Label>
                    {branches === null ? (
                      <Skeleton className="h-10 w-full rounded-md bg-slate-200" />
                    ) : (
                      <Select value={form.branchId} onValueChange={(v) => set("branchId", v)}>
                        <SelectTrigger className="h-10 rounded-md border-[#D1D7DC] bg-white text-sm text-slate-900 focus:border-[#1F70C1] focus:ring-1 focus:ring-[#1F70C1]">
                          <SelectValue placeholder="Select branch" />
                        </SelectTrigger>
                        <SelectContent className="max-h-60 border-[#D1D7DC] bg-white text-slate-900 shadow-lg">
                          {branches.map((b) => (
                            <SelectItem key={b.id} value={b.id} className="cursor-pointer py-2 focus:bg-[#EBF4FA] focus:text-[#00639B]">
                              {b.name} {b.city ? `(${b.city})` : ""}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                    {errors.branchId ? <p className="text-xs text-red-600 font-medium">{errors.branchId}</p> : null}
                  </div>

                  <div className="space-y-1.5">
                    <Label className="text-[11px] font-bold uppercase tracking-wider text-slate-600">
                      Category <span className="text-red-500">*</span>
                    </Label>
                    {categories === null ? (
                      <Skeleton className="h-10 w-full rounded-md bg-slate-200" />
                    ) : (
                      <Select value={form.categoryId} onValueChange={(v) => set("categoryId", v)}>
                        <SelectTrigger className="h-10 rounded-md border-[#D1D7DC] bg-white text-sm text-slate-900 focus:border-[#1F70C1] focus:ring-1 focus:ring-[#1F70C1]">
                          <SelectValue placeholder="Select category" />
                        </SelectTrigger>
                        <SelectContent className="border-[#D1D7DC] bg-white text-slate-900 shadow-lg">
                          {categories.map((c) => (
                            <SelectItem key={c.id} value={c.id} className="cursor-pointer py-2 focus:bg-[#EBF4FA] focus:text-[#00639B]">
                              {c.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                    {errors.categoryId ? <p className="text-xs text-red-600 font-medium">{errors.categoryId}</p> : null}
                  </div>
                </div>

                <div className="mt-4 space-y-1.5">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="description" className="text-[11px] font-bold uppercase tracking-wider text-slate-600">
                      Detailed Description of Issue <span className="text-red-500">*</span>
                    </Label>
                    <span className="text-[11px] text-slate-400">Min 10 characters</span>
                  </div>
                  <Textarea
                    id="description"
                    rows={4}
                    value={form.description}
                    onChange={(e) => set("description", e.target.value)}
                    placeholder="Provide specific details regarding your experience, location within the club, date/time, and staff involved if applicable..."
                    className="rounded-md border-[#D1D7DC] bg-white text-sm text-slate-900 placeholder:text-slate-400 focus:border-[#1F70C1] focus:ring-1 focus:ring-[#1F70C1]"
                    aria-invalid={!!errors.description}
                  />
                  {errors.description ? <p className="text-xs text-red-600 font-medium">{errors.description}</p> : null}
                </div>
              </div>

              {/* SECTION 3: Attachments & Proof */}
              <div className="rounded-lg border border-[#E2E8F0] bg-[#FAFBFC] p-5">
                <div className="mb-3 flex items-center justify-between border-b border-[#E2E8F0] pb-2.5">
                  <h2 className="text-xs font-bold uppercase tracking-wider text-slate-700 flex items-center gap-1.5">
                    <Paperclip className="h-3.5 w-3.5 text-slate-500" />
                    3. Supporting Documents & Photos (Optional)
                  </h2>
                  <span className="text-[11px] text-slate-500">Max 10MB</span>
                </div>
                <Input
                  id="attachment"
                  ref={attachmentRef}
                  type="file"
                  accept="image/png,image/jpeg,image/webp,application/pdf"
                  className="h-10 rounded-md border-[#D1D7DC] bg-white text-xs text-slate-600 file:mr-3 file:rounded file:border-0 file:bg-slate-100 file:px-3 file:py-1.5 file:text-xs file:font-semibold file:text-slate-700 hover:file:bg-slate-200"
                />
                <p className="mt-1.5 text-[11px] text-slate-500">
                  Accepted formats: PNG, JPG, WEBP, or PDF. Useful for maintenance defects or payment receipts.
                </p>
              </div>

              {/* SECTION 4: Terms & Consent */}
              <div className="rounded-lg border border-[#D1D7DC] bg-slate-50 p-4">
                <label className="flex items-start gap-3 cursor-pointer" htmlFor="privacyConsent">
                  <Checkbox
                    id="privacyConsent"
                    checked={form.privacyConsent}
                    onCheckedChange={(v) => set("privacyConsent", v === true)}
                    className="mt-0.5 border-[#94A3B8] data-[state=checked]:bg-[#1F70C1] data-[state=checked]:border-[#1F70C1]"
                  />
                  <div className="text-xs text-slate-600 leading-relaxed">
                    <p className="font-semibold text-slate-800">Authorization & Tracking Agreement</p>
                    <p className="mt-0.5">
                      I consent to FitClass storing these details to investigate and resolve my incident under the ITIL service management framework. I understand my phone number and email will be used to send automated resolution alerts and verify self-service tracking.
                    </p>
                  </div>
                </label>
                {errors.privacyConsent ? <p className="mt-2 pl-7 text-xs text-red-600 font-medium">{errors.privacyConsent}</p> : null}
              </div>

              {/* Actions & SLA Notice */}
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pt-2">
                <div className="flex items-center gap-2 text-xs text-slate-500">
                  <ShieldCheck className="h-4 w-4 text-[#036974]" />
                  <span>SLA Guarantee: P1 Critical within 15m · General inquiry within 24h</span>
                </div>

                <div className="flex items-center gap-3">
                  <Link href="/">
                    <Button variant="outline" type="button" className="h-11 rounded-md border-[#D1D7DC] text-xs font-semibold text-slate-700 hover:bg-slate-100 px-5">
                      Cancel
                    </Button>
                  </Link>

                  <Button
                    type="submit"
                    disabled={submitting}
                    className="h-11 rounded-md bg-[#1F70C1] hover:bg-[#185999] text-xs font-bold text-white shadow-sm transition px-6"
                  >
                    {submitting ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />
                        Registering Ticket...
                      </>
                    ) : (
                      <>
                        <Send className="mr-2 h-4 w-4" aria-hidden />
                        Submit Request
                      </>
                    )}
                  </Button>
                </div>
              </div>
            </form>
          </div>
        </div>
      </main>

      <SiteFooter />
    </div>
  );
}
