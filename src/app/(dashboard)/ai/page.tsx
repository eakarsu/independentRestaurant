"use client";

import { useState } from "react";
import { Header } from "@/components/layout/header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { toast } from "@/components/ui/use-toast";
import { Bot, Sparkles, TrendingUp, Package, MessageSquare, Megaphone, Calendar, DollarSign, Brain, Loader2 } from "lucide-react";
import { AISuitePanel } from "@/components/ai/ai-suite-panel";

function AIToolsPanel() {
  const [loading, setLoading] = useState<string | null>(null);
  const [results, setResults] = useState<Record<string, unknown>>({});
  const [reviewInput, setReviewInput] = useState({ rating: 5, comment: "", customerName: "Guest" });
  const [marketingInput, setMarketingInput] = useState({ type: "social", occasion: "promotion" });

  const runAIFeature = async (action: string, data = {}) => {
    setLoading(action);
    try {
      const res = await fetch("/api/ai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, data }),
      });
      const result = await res.json();
      // Surface server-side failures (e.g. missing OPENROUTER_API_KEY → 503)
      // instead of silently storing the error object as a "result".
      if (!res.ok || result?.error) {
        toast({
          title: "AI request failed",
          description: result?.error || `Server returned ${res.status}`,
          variant: "destructive",
        });
        return;
      }
      setResults((prev) => ({ ...prev, [action]: result }));
      toast({ title: "Success", description: "AI analysis complete" });
    } catch (error) {
      toast({ title: "Error", description: "AI processing failed", variant: "destructive" });
    } finally {
      setLoading(null);
    }
  };

  const features = [
    { id: "menu_optimization", title: "Menu Optimizer", desc: "Pricing & performance recommendations", icon: TrendingUp },
    { id: "demand_forecast", title: "Demand Forecaster", desc: "Predict busy periods", icon: Calendar },
    { id: "inventory_prediction", title: "Inventory Predictor", desc: "Smart order suggestions", icon: Package },
    { id: "cost_analysis", title: "Cost Analyzer", desc: "Food cost optimization", icon: DollarSign },
  ];

  const renderAIResult = (featureId: string, data: unknown) => {
    const result = data as Record<string, unknown>;

    switch (featureId) {
      case "menu_optimization":
        const menuData = result as { recommendations?: { item?: string; salesCount?: number; revenue?: number; margin?: string; suggestion?: string }[] };
        return (
          <div className="space-y-3">
            {menuData.recommendations && menuData.recommendations.length > 0 ? menuData.recommendations.map((rec, i) => (
              <div key={i} className="p-3 bg-muted/50 rounded-lg space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-medium">{rec.item || "Item"}</span>
                  {rec.margin && <Badge variant="outline">{rec.margin} margin</Badge>}
                </div>
                <div className="grid grid-cols-2 gap-2 text-sm text-muted-foreground">
                  <span>Sales: {rec.salesCount ?? "N/A"}</span>
                  <span>Revenue: ${rec.revenue?.toFixed(2) ?? "N/A"}</span>
                </div>
                {rec.suggestion && <p className="text-sm font-medium text-primary">{rec.suggestion}</p>}
              </div>
            )) : <p className="text-sm text-muted-foreground">No recommendations available</p>}
          </div>
        );

      case "demand_forecast":
        const forecastData = result as { forecast?: { dayOfWeek?: number; dayName?: string; avgOrders?: number; predictedCovers?: number }[] };
        return (
          <div className="space-y-3">
            {forecastData.forecast && forecastData.forecast.length > 0 ? forecastData.forecast.map((day, i) => (
              <div key={i} className="p-3 bg-muted/50 rounded-lg">
                <div className="flex items-center justify-between mb-2">
                  <span className="font-medium">{day.dayName || `Day ${day.dayOfWeek}`}</span>
                  <Badge variant="outline">{day.avgOrders ?? 0} avg orders</Badge>
                </div>
                <div className="text-sm text-muted-foreground">
                  <span>Predicted covers: {day.predictedCovers ?? "N/A"}</span>
                </div>
              </div>
            )) : <p className="text-sm text-muted-foreground">No forecast data available</p>}
          </div>
        );

      case "inventory_prediction":
        const inventoryData = result as { predictions?: { ingredient?: string; currentStock?: number; unit?: string; dailyUsage?: string; daysUntilEmpty?: number | null; suggestedOrder?: number; urgent?: boolean; status?: string }[] };
        return (
          <div className="space-y-3">
            {inventoryData.predictions && inventoryData.predictions.length > 0 ? inventoryData.predictions.map((item, i) => (
              <div key={i} className="p-3 bg-muted/50 rounded-lg">
                <div className="flex items-center justify-between mb-2">
                  <span className="font-medium">{item.ingredient || "Item"}</span>
                  <Badge variant={
                    item.status === "critical" ? "destructive" :
                    item.status === "low" || item.status === "below_par" ? "warning" :
                    "success"
                  }>
                    {item.status === "critical" ? "Critical" :
                     item.status === "low" ? `${item.daysUntilEmpty} days left` :
                     item.status === "below_par" ? "Below Par" :
                     item.daysUntilEmpty ? `${item.daysUntilEmpty} days` : "Healthy"}
                  </Badge>
                </div>
                <div className="grid grid-cols-2 gap-2 text-sm text-muted-foreground">
                  <span>Stock: {item.currentStock ?? 0} {item.unit || ""}</span>
                  <span>Daily use: {item.dailyUsage ?? "0"}</span>
                </div>
                {item.suggestedOrder && item.suggestedOrder > 0 && (
                  <p className="text-sm font-medium text-primary mt-1">Suggested order: {item.suggestedOrder} {item.unit || "units"}</p>
                )}
              </div>
            )) : <p className="text-sm text-muted-foreground">No inventory items found. Add ingredients in the Inventory page first.</p>}
          </div>
        );

      case "cost_analysis":
        const costData = result as { analysis?: { item?: string; price?: number; cost?: number; costPercentage?: string; profitMargin?: string; recommendation?: string }[] };
        return (
          <div className="space-y-3">
            {costData.analysis && costData.analysis.length > 0 ? costData.analysis.map((item, i) => (
              <div key={i} className="p-3 bg-muted/50 rounded-lg space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-medium">{item.item || "Item"}</span>
                  <Badge variant={parseFloat(item.costPercentage || "0") > 35 ? "destructive" : parseFloat(item.costPercentage || "0") < 25 ? "success" : "outline"}>
                    {item.costPercentage || "0"}% cost
                  </Badge>
                </div>
                <div className="grid grid-cols-3 gap-2 text-sm text-muted-foreground">
                  <span>Price: ${item.price?.toFixed(2) ?? "N/A"}</span>
                  <span>Cost: ${item.cost?.toFixed(2) ?? "N/A"}</span>
                  <span>Margin: {item.profitMargin || "N/A"}%</span>
                </div>
                {item.recommendation && (
                  <p className="text-sm font-medium text-primary">{item.recommendation}</p>
                )}
              </div>
            )) : <p className="text-sm text-muted-foreground">No analysis available</p>}
          </div>
        );

      default:
        // Fallback for any result type - display nicely
        if (typeof result === "object" && result !== null) {
          return (
            <div className="space-y-2">
              {Object.entries(result).map(([key, value]) => (
                <div key={key} className="p-3 bg-muted/50 rounded-lg">
                  <p className="text-xs text-muted-foreground capitalize">{key.replace(/_/g, " ")}</p>
                  <p className="font-medium">{typeof value === "string" ? value : JSON.stringify(value)}</p>
                </div>
              ))}
            </div>
          );
        }
        return <p className="text-sm">{String(result)}</p>;
    }
  };

  return (
    <div className="space-y-6">
        <div className="flex items-center gap-2 mb-6">
          <Bot className="h-8 w-8 text-primary" />
          <div>
            <h2 className="text-2xl font-bold">AI-Powered Insights</h2>
            <p className="text-muted-foreground">Leverage AI to optimize your restaurant operations</p>
          </div>
        </div>

        <Tabs defaultValue="analytics">
          <TabsList>
            <TabsTrigger value="analytics">Analytics AI</TabsTrigger>
            <TabsTrigger value="content">Content AI</TabsTrigger>
            <TabsTrigger value="scheduling">Scheduling AI</TabsTrigger>
          </TabsList>

          <TabsContent value="analytics" className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              {features.map((f) => (
                <Card key={f.id}>
                  <CardHeader>
                    <div className="flex items-center gap-2">
                      <f.icon className="h-5 w-5 text-primary" />
                      <CardTitle className="text-lg">{f.title}</CardTitle>
                    </div>
                    <CardDescription>{f.desc}</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <Button onClick={() => runAIFeature(f.id)} disabled={loading === f.id}>
                      {loading === f.id ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Analyzing...</> : <><Sparkles className="mr-2 h-4 w-4" /> Run Analysis</>}
                    </Button>
                    {f.id in results && results[f.id] !== undefined && (
                      <div className="mt-4 space-y-3">
                        {renderAIResult(f.id, results[f.id])}
                      </div>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          </TabsContent>

          <TabsContent value="content" className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <Card>
                <CardHeader>
                  <div className="flex items-center gap-2">
                    <MessageSquare className="h-5 w-5 text-primary" />
                    <CardTitle className="text-lg">Review Response Generator</CardTitle>
                  </div>
                  <CardDescription>Generate professional responses to customer reviews</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid gap-2">
                    <Label>Customer Name</Label>
                    <Input value={reviewInput.customerName} onChange={(e) => setReviewInput({ ...reviewInput, customerName: e.target.value })} />
                  </div>
                  <div className="grid gap-2">
                    <Label>Rating</Label>
                    <Select value={reviewInput.rating.toString()} onValueChange={(v) => setReviewInput({ ...reviewInput, rating: parseInt(v) })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {[1, 2, 3, 4, 5].map((r) => (<SelectItem key={r} value={r.toString()}>{r} Star{r > 1 ? "s" : ""}</SelectItem>))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="grid gap-2">
                    <Label>Review Comment (optional)</Label>
                    <Textarea value={reviewInput.comment} onChange={(e) => setReviewInput({ ...reviewInput, comment: e.target.value })} placeholder="The customer's review text..." />
                  </div>
                  <Button onClick={() => runAIFeature("review_response", reviewInput)} disabled={loading === "review_response"}>
                    {loading === "review_response" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4" />}
                    Generate Response
                  </Button>
                  {"review_response" in results && results.review_response !== undefined && (
                    <div className="mt-4 p-4 bg-muted rounded-lg">
                      <p className="text-sm">{(results.review_response as { response: string }).response}</p>
                    </div>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <div className="flex items-center gap-2">
                    <Megaphone className="h-5 w-5 text-primary" />
                    <CardTitle className="text-lg">Marketing Generator</CardTitle>
                  </div>
                  <CardDescription>Create promotional content for your restaurant</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid gap-2">
                    <Label>Content Type</Label>
                    <Select value={marketingInput.type} onValueChange={(v) => setMarketingInput({ ...marketingInput, type: v })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="email">Email</SelectItem>
                        <SelectItem value="social">Social Media</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="grid gap-2">
                    <Label>Occasion</Label>
                    <Select value={marketingInput.occasion} onValueChange={(v) => setMarketingInput({ ...marketingInput, occasion: v })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="holiday">Holiday</SelectItem>
                        <SelectItem value="promotion">Promotion</SelectItem>
                        <SelectItem value="newItem">New Menu Item</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <Button onClick={() => runAIFeature("marketing_generator", marketingInput)} disabled={loading === "marketing_generator"}>
                    {loading === "marketing_generator" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4" />}
                    Generate Content
                  </Button>
                  {"marketing_generator" in results && results.marketing_generator !== undefined && (
                    <div className="mt-4 p-4 bg-muted rounded-lg">
                      <p className="text-sm">{(results.marketing_generator as { content: string }).content}</p>
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="scheduling" className="space-y-4">
            <Card>
              <CardHeader>
                <div className="flex items-center gap-2">
                  <Brain className="h-5 w-5 text-primary" />
                  <CardTitle className="text-lg">AI Staff Scheduler</CardTitle>
                </div>
                <CardDescription>Get optimal staffing recommendations based on predicted demand</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-2">
                  <Label>Date</Label>
                  <Input type="date" id="scheduleDate" defaultValue={new Date().toISOString().split("T")[0]} />
                </div>
                <Button onClick={() => {
                  const date = (document.getElementById("scheduleDate") as HTMLInputElement)?.value;
                  runAIFeature("staff_schedule", { date });
                }} disabled={loading === "staff_schedule"}>
                  {loading === "staff_schedule" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4" />}
                  Get Recommendations
                </Button>
                {"staff_schedule" in results && results.staff_schedule !== undefined && (
                  <div className="mt-4 space-y-2">
                    {((results.staff_schedule as { schedule: { role: string; recommended: number; shifts: { time: string; count: number }[] }[] }).schedule || []).map((item, i) => (
                      <div key={i} className="p-3 bg-muted rounded-lg">
                        <div className="flex justify-between items-center mb-2">
                          <span className="font-medium">{item.role}</span>
                          <Badge>{item.recommended} recommended</Badge>
                        </div>
                        <div className="text-sm text-muted-foreground">
                          {item.shifts.map((s, j) => (<p key={j}>{s.time}: {s.count} staff</p>))}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
    </div>
  );
}

// Unified AI hub: merges "AI Features" (advisory tools) and "AI Suite" (workflows)
// into a single nav entry with two top-level tabs.
export default function AIPage() {
  return (
    <div className="flex flex-col h-full">
      <Header title="AI" />
      <div className="flex-1 overflow-auto p-6">
        <Tabs defaultValue="tools">
          <TabsList>
            <TabsTrigger value="tools"><Bot className="h-4 w-4 mr-1" />AI Tools</TabsTrigger>
            <TabsTrigger value="suite"><Sparkles className="h-4 w-4 mr-1" />AI Suite</TabsTrigger>
          </TabsList>
          <TabsContent value="tools" className="mt-4"><AIToolsPanel /></TabsContent>
          <TabsContent value="suite" className="mt-4"><AISuitePanel /></TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
