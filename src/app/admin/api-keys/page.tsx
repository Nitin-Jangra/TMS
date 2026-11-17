"use client";

// Integration API keys for CRM / LMS consumption + quick integration guide.

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { Copy, KeyRound, Loader2, Plus } from "lucide-react";

interface Client {
  id: string; name: string; keyPrefix: string; apiKey: string; scopes: string; isActive: boolean; lastUsedAt: string | null; createdAt: string;
}

export default function ApiKeysPage() {
  const { toast } = useToast();
  const [clients, setClients] = useState<Client[] | null>(null);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const res = await fetch("/api/v1/admin/api-keys");
    const body = await res.json();
    if (body.success) setClients(body.data.clients);
  }, []);

  useEffect(() => { load(); }, [load]);

  async function create() {
    setBusy(true);
    try {
      const res = await fetch("/api/v1/admin/api-keys", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: name.trim() || "New integration", scopes: "read,write" }),
      });
      const body = await res.json();
      if (body.success) {
        toast({ title: "API key created", description: "Share it with the CRM/LMS integration team." });
        setName("");
        await load();
      } else {
        toast({ title: "Failed", description: body.error?.message, variant: "destructive" });
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold text-[#0a2350]">Integration API keys</h1>
        <p className="mt-0.5 text-sm text-slate-500">
          CRM and LMS systems call the API with header <span className="font-mono text-xs">x-api-key</span>.
          Full endpoint reference lives at <a className="text-[#2c6bdf] hover:underline" href="/docs/api" target="_blank">/docs/api</a> and the
          machine spec at <span className="font-mono text-xs">/api/v1/openapi</span>.
        </p>
      </div>

      <Card>
        <CardHeader className="pb-3"><CardTitle className="flex items-center gap-2 text-sm font-semibold text-[#0a2350]"><Plus className="h-4 w-4 text-[#2c6bdf]" aria-hidden />Create a key</CardTitle></CardHeader>
        <CardContent className="flex gap-2">
          <Input placeholder="e.g. FitClass LMS Production" value={name} onChange={(e) => setName(e.target.value)} className="max-w-md" />
          <Button onClick={create} disabled={busy} className="bg-[#0a2350] hover:bg-[#10306b]">
            {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden /> : <KeyRound className="mr-2 h-4 w-4" aria-hidden />}Create key
          </Button>
        </CardContent>
      </Card>

      {clients === null ? (
        <Skeleton className="h-48" />
      ) : (
        <div className="space-y-3">
          {clients.map((c) => (
            <Card key={c.id}>
              <CardHeader className="pb-2">
                <CardTitle className="flex flex-wrap items-center justify-between gap-2 text-sm font-semibold text-[#0a2350]">
                  {c.name}
                  <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${c.isActive ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-500"}`}>
                    {c.isActive ? "Active" : "Disabled"} · scopes: {c.scopes}
                  </span>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                <div className="flex items-center gap-2">
                  <code className="thin-scroll flex-1 overflow-x-auto rounded-md bg-slate-900 px-3 py-2 font-mono text-xs text-emerald-300">{c.apiKey}</code>
                  <Button variant="outline" size="sm" onClick={async () => { await navigator.clipboard.writeText(c.apiKey).catch(() => undefined); toast({ title: "Key copied" }); }}>
                    <Copy className="h-3.5 w-3.5" aria-hidden />
                  </Button>
                </div>
                <p className="text-[11px] text-slate-400">Created {new Date(c.createdAt).toLocaleString("en-IN")} · prefix {c.keyPrefix} · dev-mode storage (production keeps only the hash)</p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
