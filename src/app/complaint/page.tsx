"use client";

// Customer complaint registration form.
// ServiceNow Service Portal / Employee Center Record Producer UI.
// Features:
// 1. Full ITIL Incident Record Producer layout with Polaris design tokens.
// 2. Email OTP identity verification before final ticket creation.
// 3. Multi-file attachment support (images + PDFs) with D1 storage size guarding.
// 4. Idempotency-Key duplicate submission prevention.

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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  InputOTP,
  InputOTPGroup,
  InputOTPSlot,
  InputOTPSeparator,
} from "@/components/ui/input-otp";
import {
  AlertCircle,
  CheckCircle2,
  ChevronRight,
  FileText,
  ImageIcon,
  KeyRound,
  Loader2,
  Paperclip,
  RotateCcw,
  Send,
  ShieldCheck,
  Trash2,
  UploadCloud,
  X,
} from "lucide-react";

interface BranchOption {
  id: string;
  code: string;
  name: string;
  city: string | null;
}
interface CategoryOption {
  id: string;
  name: string;
}

const EMPTY_FORM = {
  customerName: "",
  customerPhone: "",
  customerEmail: "",
  branchId: "",
  categoryId: "",
  description: "",
  privacyConsent: false,
};

const MAX_FILE_SIZE_BYTES = 1.9 * 1024 * 1024; // 1.9MB per row on Cloudflare D1
const MAX_ATTACHMENTS = 5;

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function ComplaintPage() {
  const router = useRouter();
  const [form, setForm] = useState(EMPTY_FORM);
  const [branches, setBranches] = useState<BranchOption[] | null>(null);
  const [categories, setCategories] = useState<CategoryOption[] | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [topError, setTopError] = useState("");
  
  // Attachments state
  const [files, setFiles] = useState<File[]>([]);
  const [fileError, setFileError] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  // OTP Verification state
  const [otpModalOpen, setOtpModalOpen] = useState(false);
  const [otpCode, setOtpCode] = useState("");
  const [otpToken, setOtpToken] = useState("");
  const [sendingOtp, setSendingOtp] = useState(false);
  const [verifyingOtp, setVerifyingOtp] = useState(false);
  const [otpError, setOtpError] = useState("");
  const [resendTimer, setResendTimer] = useState(0);
  const [devCodeHint, setDevCodeHint] = useState("");

  const idempotencyKey = useRef(`portal-${Date.now()}-${Math.random().toString(36).slice(2)}`);

  // Fetch branches and categories
  useEffect(() => {
    fetch("/api/v1/public/branches")
      .then((r) => r.json())
      .then((d) => setBranches(d.data?.branches ?? []))
      .catch(() => setBranches([]));

    fetch("/api/v1/public/categories")
      .then((r) => r.json())
      .then((d) => setCategories(d.data?.categories ?? []))
      .catch(() => setCategories([]));
  }, []);

  // Resend countdown timer
  useEffect(() => {
    if (resendTimer <= 0) return;
    const interval = setInterval(() => {
      setResendTimer((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);
    return () => clearInterval(interval);
  }, [resendTimer]);

  const set = (key: keyof typeof EMPTY_FORM, value: string | boolean) => {
    setForm((f) => ({ ...f, [key]: value }));
    setErrors((e) => ({ ...e, [key]: "" }));
  };

  // Form field validation
  function validate(): boolean {
    const e: Record<string, string> = {};
    if (form.customerName.trim().length < 2) e.customerName = "Please enter your full name (at least 2 characters).";
    if (!/^\d{10,12}$/.test(form.customerPhone.replace(/\D/g, ""))) e.customerPhone = "Enter a valid 10-12 digit mobile number.";
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.customerEmail)) e.customerEmail = "Enter a valid email address.";
    if (!form.branchId) e.branchId = "Select your branch location.";
    if (!form.categoryId) e.categoryId = "Select a complaint category.";
    if (form.description.trim().length < 10) e.description = "Please describe your complaint (minimum 10 characters).";
    if (!form.privacyConsent) e.privacyConsent = "Privacy consent is required.";
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  // Handle file additions
  function handleFilesAdded(incoming: FileList | null) {
    if (!incoming || incoming.length === 0) return;
    setFileError("");

    const newFiles: File[] = [];
    let oversizedCount = 0;

    for (let i = 0; i < incoming.length; i++) {
      const f = incoming[i];
      if (files.length + newFiles.length >= MAX_ATTACHMENTS) {
        setFileError(`You can attach a maximum of ${MAX_ATTACHMENTS} files.`);
        break;
      }
      if (f.size > MAX_FILE_SIZE_BYTES) {
        oversizedCount++;
        continue;
      }
      // Check for duplicate file names
      const duplicate = files.some((existing) => existing.name === f.name && existing.size === f.size);
      if (!duplicate) {
        newFiles.push(f);
      }
    }

    if (oversizedCount > 0) {
      setFileError(`${oversizedCount} file(s) exceeded the 1.9 MB storage limit and were skipped.`);
    }

    if (newFiles.length > 0) {
      setFiles((prev) => [...prev, ...newFiles]);
    }

    // Reset input so user can pick the same file again if desired
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  }

  function removeFile(index: number) {
    setFiles((prev) => prev.filter((_, i) => i !== index));
    setFileError("");
  }

  // Step 1: Request OTP and open verification modal
  async function handleStartVerification(ev: React.FormEvent) {
    ev.preventDefault();
    setTopError("");
    if (!validate()) return;

    setSendingOtp(true);
    setOtpError("");
    try {
      const res = await fetch("/api/v1/public/otp/send", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          email: form.customerEmail,
          phone: form.customerPhone,
          name: form.customerName,
        }),
      });

      const body = await res.json();
      if (!res.ok || !body.success) {
        setTopError(body.error?.message || "Failed to dispatch verification code. Please try again.");
        return;
      }

      setOtpToken(body.data.token);
      setDevCodeHint(body.data.devCode || "");
      setResendTimer(60);
      setOtpCode("");
      setOtpModalOpen(true);
    } catch {
      setTopError("Network error. Please check your connection and try again.");
    } finally {
      setSendingOtp(false);
    }
  }

  // Resend OTP
  async function handleResendOtp() {
    if (resendTimer > 0 || sendingOtp) return;
    setSendingOtp(true);
    setOtpError("");
    try {
      const res = await fetch("/api/v1/public/otp/send", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          email: form.customerEmail,
          phone: form.customerPhone,
          name: form.customerName,
        }),
      });
      const body = await res.json();
      if (!res.ok || !body.success) {
        setOtpError(body.error?.message || "Failed to resend code. Please try again.");
        return;
      }
      setOtpToken(body.data.token);
      setDevCodeHint(body.data.devCode || "");
      setResendTimer(60);
    } catch {
      setOtpError("Network error. Please try again.");
    } finally {
      setSendingOtp(false);
    }
  }

  // Step 2: Verify OTP and finalize ticket registration
  async function handleVerifyAndSubmit() {
    if (!otpCode || otpCode.length !== 6) {
      setOtpError("Please enter the complete 6-digit code.");
      return;
    }

    setVerifyingOtp(true);
    setOtpError("");

    try {
      // 1. Verify OTP with backend
      const verifyRes = await fetch("/api/v1/public/otp/verify", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          email: form.customerEmail,
          phone: form.customerPhone,
          code: otpCode,
          token: otpToken,
        }),
      });

      const verifyData = await verifyRes.json();
      if (!verifyRes.ok || !verifyData.success) {
        setOtpError(verifyData.error?.message || "Invalid verification code.");
        setVerifyingOtp(false);
        return;
      }

      const submissionToken = verifyData.data.submissionToken as string;

      // 2. Submit Complaint Ticket
      const complaintRes = await fetch("/api/v1/public/complaints", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "idempotency-key": idempotencyKey.current,
        },
        body: JSON.stringify({
          ...form,
          submissionToken,
        }),
      });

      const complaintData = await complaintRes.json();
      if (!complaintRes.ok || !complaintData.success) {
        setOtpError(complaintData.error?.message || "Failed to create ticket. Please try again.");
        setVerifyingOtp(false);
        return;
      }

      const ticketNumber = complaintData.data.ticketNumber as string;

      // 3. Upload multiple attachments if any exist
      if (files.length > 0) {
        const fd = new FormData();
        fd.append("ticketNumber", ticketNumber);
        fd.append("mobileNumber", form.customerPhone);
        for (const f of files) {
          fd.append("files", f);
        }
        await fetch("/api/v1/public/tickets/attachments", {
          method: "POST",
          body: fd,
        }).catch((err) => console.error("Attachment upload error:", err));
      }

      // 4. Success -> redirect to tracking / confirmation view
      setOtpModalOpen(false);
      router.push(`/complaint/success?ticket=${encodeURIComponent(ticketNumber)}`);
    } catch {
      setOtpError("Network error while submitting complaint. Please try again.");
      setVerifyingOtp(false);
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
                    Submit an official request to your branch management team. Verified with one-time security OTP.
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

            <form onSubmit={handleStartVerification} noValidate className="space-y-7">
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
                  <div className="flex items-center justify-between">
                    <Label htmlFor="customerEmail" className="text-[11px] font-bold uppercase tracking-wider text-slate-600">
                      Email Address (for resolution alerts & security OTP) <span className="text-red-500">*</span>
                    </Label>
                    <span className="text-[10px] font-semibold text-[#1F70C1] flex items-center gap-1">
                      <KeyRound className="h-3 w-3" /> OTP Verified
                    </span>
                  </div>
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

              {/* SECTION 3: Multi-File Attachments & Proof */}
              <div className="rounded-lg border border-[#E2E8F0] bg-[#FAFBFC] p-5">
                <div className="mb-3 flex items-center justify-between border-b border-[#E2E8F0] pb-2.5">
                  <h2 className="text-xs font-bold uppercase tracking-wider text-slate-700 flex items-center gap-1.5">
                    <Paperclip className="h-3.5 w-3.5 text-slate-500" />
                    3. Supporting Documents & Photos (Optional)
                  </h2>
                  <span className="text-[11px] text-slate-500">
                    {files.length} / {MAX_ATTACHMENTS} attached · Max 1.9MB per file
                  </span>
                </div>

                {/* Hidden File Input */}
                <input
                  ref={fileInputRef}
                  type="file"
                  multiple
                  accept="image/png,image/jpeg,image/webp,application/pdf"
                  className="hidden"
                  onChange={(e) => handleFilesAdded(e.target.files)}
                />

                {/* Dropzone trigger */}
                <div
                  onClick={() => fileInputRef.current?.click()}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => {
                    e.preventDefault();
                    handleFilesAdded(e.dataTransfer.files);
                  }}
                  className="group flex flex-col items-center justify-center rounded-lg border-2 border-dashed border-[#CBD5E1] bg-white p-6 text-center cursor-pointer transition hover:border-[#1F70C1] hover:bg-[#F8FAFC]"
                >
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[#EBF4FA] text-[#1F70C1] group-hover:bg-[#1F70C1] group-hover:text-white transition">
                    <UploadCloud className="h-5 w-5" />
                  </div>
                  <p className="mt-2 text-xs font-semibold text-slate-800">
                    Click to browse or drag and drop files here
                  </p>
                  <p className="mt-1 text-[11px] text-slate-500">
                    PNG, JPG, WEBP, or PDF (Up to {MAX_ATTACHMENTS} files, max 1.9MB each for database storage)
                  </p>
                </div>

                {fileError ? (
                  <p className="mt-2 text-xs font-medium text-amber-700 flex items-center gap-1.5">
                    <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                    {fileError}
                  </p>
                ) : null}

                {/* Selected Files List */}
                {files.length > 0 ? (
                  <div className="mt-4 space-y-2">
                    <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                      Attached Files ({files.length}):
                    </p>
                    <div className="grid gap-2 sm:grid-cols-2">
                      {files.map((file, idx) => (
                        <div
                          key={`${file.name}-${idx}`}
                          className="flex items-center justify-between rounded-md border border-[#D1D7DC] bg-white p-2.5 shadow-2xs"
                        >
                          <div className="flex items-center gap-2 overflow-hidden">
                            {file.type.startsWith("image/") ? (
                              <ImageIcon className="h-4 w-4 shrink-0 text-[#1F70C1]" />
                            ) : (
                              <FileText className="h-4 w-4 shrink-0 text-slate-600" />
                            )}
                            <div className="overflow-hidden">
                              <p className="truncate text-xs font-semibold text-slate-800" title={file.name}>
                                {file.name}
                              </p>
                              <p className="text-[10px] text-slate-500">{formatBytes(file.size)}</p>
                            </div>
                          </div>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              removeFile(idx);
                            }}
                            className="ml-2 rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-red-600 transition"
                            title="Remove attachment"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : null}
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
                    disabled={sendingOtp}
                    className="h-11 rounded-md bg-[#1F70C1] hover:bg-[#185999] text-xs font-bold text-white shadow-sm transition px-6"
                  >
                    {sendingOtp ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />
                        Sending Security Code...
                      </>
                    ) : (
                      <>
                        <KeyRound className="mr-2 h-4 w-4" aria-hidden />
                        Verify & Submit Request
                      </>
                    )}
                  </Button>
                </div>
              </div>
            </form>
          </div>
        </div>
      </main>

      {/* OTP Verification Modal (Polaris / Service Portal Themed) */}
      <Dialog open={otpModalOpen} onOpenChange={setOtpModalOpen}>
        <DialogContent className="max-w-md border-[#D1D7DC] bg-white p-6 shadow-2xl text-slate-900 sm:rounded-xl">
          <DialogHeader className="text-center sm:text-center">
            <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-[#EBF4FA] text-[#00639B] border border-[#0084D1]/20">
              <ShieldCheck className="h-6 w-6 text-[#1F70C1]" />
            </div>
            <DialogTitle className="text-lg font-bold text-slate-900">
              Verify Your Identity
            </DialogTitle>
            <DialogDescription className="text-xs text-slate-600 mt-1">
              To prevent unauthorized submissions, we dispatched a 6-digit one-time code to:
              <br />
              <strong className="text-slate-900 font-semibold">{form.customerEmail}</strong>
            </DialogDescription>
          </DialogHeader>

          {/* Dev/Demo Hint if simulated or local */}
          {devCodeHint ? (
            <div className="rounded-md border border-amber-200 bg-amber-50 p-2.5 text-center text-xs text-amber-900">
              <span className="font-semibold">Demo Sandbox:</span> Your code is{" "}
              <code className="rounded bg-amber-200/80 px-1.5 py-0.5 font-mono font-bold text-amber-950">
                {devCodeHint}
              </code>
              <button
                type="button"
                onClick={() => {
                  setOtpCode(devCodeHint);
                  setOtpError("");
                }}
                className="ml-2 font-bold text-[#1F70C1] underline hover:text-[#185999]"
              >
                Auto-fill
              </button>
            </div>
          ) : null}

          {/* OTP Input */}
          <div className="my-3 flex flex-col items-center justify-center">
            <Label className="mb-3 text-[11px] font-bold uppercase tracking-wider text-slate-500">
              Enter 6-Digit One-Time Code
            </Label>
            <InputOTP
              maxLength={6}
              value={otpCode}
              onChange={(val) => {
                setOtpCode(val);
                setOtpError("");
              }}
            >
              <InputOTPGroup>
                <InputOTPSlot index={0} className="h-11 w-10 text-base font-bold border-[#CBD5E1]" />
                <InputOTPSlot index={1} className="h-11 w-10 text-base font-bold border-[#CBD5E1]" />
                <InputOTPSlot index={2} className="h-11 w-10 text-base font-bold border-[#CBD5E1]" />
              </InputOTPGroup>
              <InputOTPSeparator />
              <InputOTPGroup>
                <InputOTPSlot index={3} className="h-11 w-10 text-base font-bold border-[#CBD5E1]" />
                <InputOTPSlot index={4} className="h-11 w-10 text-base font-bold border-[#CBD5E1]" />
                <InputOTPSlot index={5} className="h-11 w-10 text-base font-bold border-[#CBD5E1]" />
              </InputOTPGroup>
            </InputOTP>

            {otpError ? (
              <p className="mt-3 text-xs font-semibold text-red-600 flex items-center gap-1.5 text-center">
                <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                {otpError}
              </p>
            ) : null}

            {/* Resend Timer */}
            <div className="mt-4 text-center text-xs text-slate-500">
              Didn&apos;t receive the email code?{" "}
              {resendTimer > 0 ? (
                <span>
                  Resend in <span className="font-semibold text-slate-800">{resendTimer}s</span>
                </span>
              ) : (
                <button
                  type="button"
                  onClick={handleResendOtp}
                  disabled={sendingOtp}
                  className="font-bold text-[#1F70C1] hover:underline"
                >
                  Resend Code
                </button>
              )}
            </div>
          </div>

          {/* Actions */}
          <div className="mt-4 flex flex-col sm:flex-row items-center justify-end gap-2.5">
            <Button
              type="button"
              variant="outline"
              disabled={verifyingOtp}
              onClick={() => setOtpModalOpen(false)}
              className="w-full sm:w-auto h-10 rounded-md border-[#D1D7DC] text-xs font-semibold text-slate-700 hover:bg-slate-100"
            >
              Cancel / Edit
            </Button>
            <Button
              type="button"
              disabled={otpCode.length !== 6 || verifyingOtp}
              onClick={handleVerifyAndSubmit}
              className="w-full sm:w-auto h-10 rounded-md bg-[#1F70C1] hover:bg-[#185999] text-xs font-bold text-white shadow-sm transition"
            >
              {verifyingOtp ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Verifying & Creating Ticket...
                </>
              ) : (
                <>
                  <ShieldCheck className="mr-2 h-4 w-4" />
                  Confirm & Submit Incident
                </>
              )}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <SiteFooter />
    </div>
  );
}
