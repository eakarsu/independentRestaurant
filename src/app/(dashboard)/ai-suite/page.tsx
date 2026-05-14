"use client";

/**
 * AI Suite — UI for the five new AI features:
 *   1. Dynamic pricing (manager approval queue)
 *   2. Waste-to-recipe special generator
 *   3. No-show predictor (paginated risk list)
 *   4. Tip-fairness analyzer (Gini reports)
 *   5. SMS / WhatsApp concierge inbox
 *
 * Each tab paginates its own list and includes the "Run AI" trigger.
 */

import { useEffect, useState, useCallback } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Pagination } from "@/components/ui/pagination";
import { toast } from "@/components/ui/use-toast";
import { Loader2, RefreshCw, ChefHat, Activity, AlertTriangle, MessageSquare, Tag } from "lucide-react";

type Paged<T> = { data: T[]; pagination: { page: number; pageSize: number; totalItems: number; totalPages: number } };

function useApi<T>(url: string) {
  const [data, setData] = useState<Paged<T> | null>(null);
  const [loading, setLoading] = useState(false);
  const fetchIt = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch(url);
      const j = await r.json();
      setData(j);
    } catch (e) {
      toast({ title: "Failed to load", description: String(e), variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [url]);
  useEffect(() => {
    fetchIt();
  }, [fetchIt]);
  return { data, loading, refetch: fetchIt };
}

function trigger(url: string, method = "POST", body?: unknown) {
  return fetch(url, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  }).then(async (r) => {
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.error || `HTTP ${r.status}`);
    return j;
  });
}

export default function AISuitePage() {
  return (
    <div className="container mx-auto p-6 space-y-6">
      <div>
        <h1 className="text-3xl font-bold flex items-center gap-2">
          <Activity className="w-7 h-7 text-primary" /> AI Suite
        </h1>
        <p className="text-muted-foreground">
          Five new AI workflows: dynamic pricing, waste-to-recipe, no-show prediction, tip fairness, SMS concierge.
        </p>
      </div>

      <Tabs defaultValue="pricing">
        <TabsList>
          <TabsTrigger value="pricing"><Tag className="w-4 h-4 mr-1" />Dynamic Pricing</TabsTrigger>
          <TabsTrigger value="waste"><ChefHat className="w-4 h-4 mr-1" />Waste → Recipe</TabsTrigger>
          <TabsTrigger value="noshow"><AlertTriangle className="w-4 h-4 mr-1" />No-Show Risk</TabsTrigger>
          <TabsTrigger value="tips"><Activity className="w-4 h-4 mr-1" />Tip Fairness</TabsTrigger>
          <TabsTrigger value="concierge"><MessageSquare className="w-4 h-4 mr-1" />SMS Concierge</TabsTrigger>
        </TabsList>

        <TabsContent value="pricing"><PricingTab /></TabsContent>
        <TabsContent value="waste"><WasteTab /></TabsContent>
        <TabsContent value="noshow"><NoShowTab /></TabsContent>
        <TabsContent value="tips"><TipsTab /></TabsContent>
        <TabsContent value="concierge"><ConciergeTab /></TabsContent>
      </Tabs>
    </div>
  );
}

// ------------------- Tabs -------------------

function PricingTab() {
  const [page, setPage] = useState(1);
  const [running, setRunning] = useState(false);
  const { data, loading, refetch } = useApi<any>(`/api/ai/dynamic-pricing?status=pending&page=${page}&pageSize=10`);

  const run = async () => {
    setRunning(true);
    try {
      const res = await trigger("/api/ai/dynamic-pricing");
      toast({ title: "Pricing AI complete", description: `${res.created} suggestions generated.` });
      refetch();
    } catch (e: any) {
      toast({ title: "Failed", description: e.message, variant: "destructive" });
    } finally {
      setRunning(false);
    }
  };

  const decide = async (id: string, action: "approve" | "reject" | "apply") => {
    try {
      await trigger(`/api/ai/dynamic-pricing/${id}`, "PATCH", { action });
      toast({ title: `Suggestion ${action}d` });
      refetch();
    } catch (e: any) {
      toast({ title: "Failed", description: e.message, variant: "destructive" });
    }
  };

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between">
        <div>
          <CardTitle>Dynamic Pricing Queue</CardTitle>
          <CardDescription>Manager approval required before any price change is applied.</CardDescription>
        </div>
        <Button onClick={run} disabled={running}>
          {running ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <RefreshCw className="w-4 h-4 mr-2" />}
          Run pricing AI
        </Button>
      </CardHeader>
      <CardContent>
        {loading && <p className="text-muted-foreground">Loading…</p>}
        {data?.data?.length === 0 && <p className="text-muted-foreground">No pending suggestions.</p>}
        <div className="space-y-2">
          {data?.data?.map((s: any) => (
            <div key={s.id} className="border rounded-lg p-3 flex items-center justify-between">
              <div>
                <div className="font-medium">{s.menuItem?.name || s.menuItemId}</div>
                <div className="text-sm text-muted-foreground">
                  ${s.oldPrice.toFixed(2)} → <strong>${s.suggestedPrice.toFixed(2)}</strong> · {s.reason}
                </div>
              </div>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" onClick={() => decide(s.id, "reject")}>Reject</Button>
                <Button size="sm" variant="secondary" onClick={() => decide(s.id, "approve")}>Approve</Button>
                <Button size="sm" onClick={() => decide(s.id, "apply")}>Apply now</Button>
              </div>
            </div>
          ))}
        </div>
        {data && data.pagination.totalPages > 1 && (
          <div className="mt-4">
            <Pagination
              currentPage={data.pagination.page}
              totalPages={data.pagination.totalPages}
              totalItems={data.pagination.totalItems}
              pageSize={data.pagination.pageSize}
              onPageChange={setPage}
              onPageSizeChange={() => {}}
            />
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function WasteTab() {
  const [page, setPage] = useState(1);
  const [running, setRunning] = useState(false);
  const { data, loading, refetch } = useApi<any>(`/api/ai/waste-recipe?page=${page}&pageSize=10`);

  const run = async () => {
    setRunning(true);
    try {
      const res = await trigger("/api/ai/waste-recipe");
      toast({ title: "Special generated", description: res.menuItem?.name || res.message || "Done." });
      refetch();
    } catch (e: any) {
      toast({ title: "Failed", description: e.message, variant: "destructive" });
    } finally {
      setRunning(false);
    }
  };

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between">
        <div>
          <CardTitle>Waste → Recipe Specials</CardTitle>
          <CardDescription>AI proposes a special using near-expiry / over-stocked ingredients.</CardDescription>
        </div>
        <Button onClick={run} disabled={running}>
          {running ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <ChefHat className="w-4 h-4 mr-2" />}
          Generate today's special
        </Button>
      </CardHeader>
      <CardContent className="space-y-2">
        {loading && <p className="text-muted-foreground">Loading…</p>}
        {data?.data?.map((row: any) => (
          <div key={row.id} className="border rounded-lg p-3 text-sm">
            <div className="flex items-center justify-between">
              <span className="font-medium">{row.output?.name || "(no name)"}</span>
              <Badge variant="outline">{new Date(row.createdAt).toLocaleDateString()}</Badge>
            </div>
            <div className="text-muted-foreground mt-1">{row.output?.description}</div>
            {row.output?.reasoning && (
              <div className="mt-1 italic text-xs">Why: {row.output.reasoning}</div>
            )}
          </div>
        ))}
        {data && data.pagination.totalPages > 1 && (
          <div className="mt-4">
            <Pagination
              currentPage={data.pagination.page}
              totalPages={data.pagination.totalPages}
              totalItems={data.pagination.totalItems}
              pageSize={data.pagination.pageSize}
              onPageChange={setPage}
              onPageSizeChange={() => {}}
            />
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function NoShowTab() {
  const [page, setPage] = useState(1);
  const [running, setRunning] = useState(false);
  const { data, loading, refetch } = useApi<any>(`/api/ai/no-show-predictor?page=${page}&pageSize=10`);

  const run = async () => {
    setRunning(true);
    try {
      const res = await trigger("/api/ai/no-show-predictor");
      toast({ title: "Risk scores updated", description: `${res.written} customers scored.` });
      refetch();
    } catch (e: any) {
      toast({ title: "Failed", description: e.message, variant: "destructive" });
    } finally {
      setRunning(false);
    }
  };

  const bandColor = (b: string) =>
    b === "high" ? "destructive" : b === "medium" ? "secondary" : "outline";

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between">
        <div>
          <CardTitle>No-Show Risk Scores</CardTitle>
          <CardDescription>Per-customer probability surfaced to hosts in the reservation UI.</CardDescription>
        </div>
        <Button onClick={run} disabled={running}>
          {running ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <RefreshCw className="w-4 h-4 mr-2" />}
          Recompute scores
        </Button>
      </CardHeader>
      <CardContent>
        {loading && <p className="text-muted-foreground">Loading…</p>}
        <div className="space-y-2">
          {data?.data?.map((r: any) => (
            <div key={r.id} className="border rounded-lg p-3">
              <div className="flex items-center justify-between">
                <span className="font-medium">{r.customerName}</span>
                <Badge variant={bandColor(r.riskBand) as any}>
                  {r.riskBand} · {(r.riskScore * 100).toFixed(0)}%
                </Badge>
              </div>
              <div className="text-sm text-muted-foreground">
                {r.totalReservations} reservations · {r.noShowCount} no-shows · {r.cancellationCount} cancellations
              </div>
              <div className="text-xs italic mt-1">{r.rationale}</div>
            </div>
          ))}
        </div>
        {data && data.pagination.totalPages > 1 && (
          <div className="mt-4">
            <Pagination
              currentPage={data.pagination.page}
              totalPages={data.pagination.totalPages}
              totalItems={data.pagination.totalItems}
              pageSize={data.pagination.pageSize}
              onPageChange={setPage}
              onPageSizeChange={() => {}}
            />
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function TipsTab() {
  const [page, setPage] = useState(1);
  const [running, setRunning] = useState(false);
  const { data, loading, refetch } = useApi<any>(`/api/ai/tip-fairness?page=${page}&pageSize=10`);

  const run = async () => {
    setRunning(true);
    try {
      const res = await trigger("/api/ai/tip-fairness", "POST", {});
      toast({ title: "Fairness report ready", description: `Gini = ${res.giniIndex}` });
      refetch();
    } catch (e: any) {
      toast({ title: "Failed", description: e.message, variant: "destructive" });
    } finally {
      setRunning(false);
    }
  };

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between">
        <div>
          <CardTitle>Tip Fairness Reports</CardTitle>
          <CardDescription>Gini index + flagged staff vs. weighted-hours fair share.</CardDescription>
        </div>
        <Button onClick={run} disabled={running}>
          {running ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Activity className="w-4 h-4 mr-2" />}
          Run fairness analysis
        </Button>
      </CardHeader>
      <CardContent className="space-y-2">
        {loading && <p className="text-muted-foreground">Loading…</p>}
        {data?.data?.map((r: any) => (
          <div key={r.id} className="border rounded-lg p-3">
            <div className="flex items-center justify-between">
              <span className="font-medium">
                {new Date(r.periodStart).toLocaleDateString()} → {new Date(r.periodEnd).toLocaleDateString()}
              </span>
              <Badge variant={r.giniIndex > 0.4 ? "destructive" : r.giniIndex > 0.2 ? "secondary" : "outline"}>
                Gini {r.giniIndex}
              </Badge>
            </div>
            <p className="text-sm mt-2">{r.summary}</p>
            <div className="text-xs text-muted-foreground mt-1">
              {Array.isArray(r.flagged) ? `${r.flagged.length} staff flagged` : ""}
            </div>
          </div>
        ))}
        {data && data.pagination.totalPages > 1 && (
          <div className="mt-4">
            <Pagination
              currentPage={data.pagination.page}
              totalPages={data.pagination.totalPages}
              totalItems={data.pagination.totalItems}
              pageSize={data.pagination.pageSize}
              onPageChange={setPage}
              onPageSizeChange={() => {}}
            />
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function ConciergeTab() {
  const [page, setPage] = useState(1);
  const { data, loading, refetch } = useApi<any>(`/api/concierge/sms?page=${page}&pageSize=20`);

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between">
        <div>
          <CardTitle>SMS / WhatsApp Concierge</CardTitle>
          <CardDescription>Inbound + outbound messages routed through the AI concierge.</CardDescription>
        </div>
        <Button variant="outline" onClick={refetch}>
          <RefreshCw className="w-4 h-4 mr-2" /> Refresh
        </Button>
      </CardHeader>
      <CardContent className="space-y-2">
        {loading && <p className="text-muted-foreground">Loading…</p>}
        {data?.data?.map((m: any) => (
          <div
            key={m.id}
            className={`border rounded-lg p-3 ${m.direction === "inbound" ? "bg-muted/30" : "bg-primary/5"}`}
          >
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>
                {m.direction.toUpperCase()} · {m.channel} · {m.fromNumber} → {m.toNumber}
              </span>
              <span>{new Date(m.createdAt).toLocaleString()}</span>
            </div>
            <p className="mt-1">{m.body}</p>
            {m.intent && <Badge variant="outline" className="mt-2">intent: {m.intent}</Badge>}
          </div>
        ))}
        {data && data.pagination.totalPages > 1 && (
          <div className="mt-4">
            <Pagination
              currentPage={data.pagination.page}
              totalPages={data.pagination.totalPages}
              totalItems={data.pagination.totalItems}
              pageSize={data.pagination.pageSize}
              onPageChange={setPage}
              onPageSizeChange={() => {}}
            />
          </div>
        )}
      </CardContent>
    </Card>
  );
}
