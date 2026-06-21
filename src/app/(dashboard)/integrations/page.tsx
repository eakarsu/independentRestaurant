"use client";

import { useEffect, useState } from "react";
import { Header } from "@/components/layout/header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "@/components/ui/use-toast";
import { Plug, CreditCard, Truck, Calendar, FileText, Star, Settings, Loader2 } from "lucide-react";

interface Integration {
  id: string;
  type: string;
  name: string;
  isActive: boolean;
  config: { desc?: string; apiKey?: string; [key: string]: unknown } | null;
  lastSync: string | null;
}

const CATEGORIES = [
  { id: "pos", name: "POS Systems", icon: CreditCard },
  { id: "delivery", name: "Delivery Platforms", icon: Truck },
  { id: "reservations", name: "Reservation Platforms", icon: Calendar },
  { id: "payments", name: "Payment Processors", icon: CreditCard },
  { id: "accounting", name: "Accounting Software", icon: FileText },
  { id: "reviews", name: "Review Platforms", icon: Star },
];

const ICONS: Record<string, typeof CreditCard> = {
  pos: CreditCard,
  delivery: Truck,
  reservations: Calendar,
  payments: CreditCard,
  accounting: FileText,
  reviews: Star,
};

export default function IntegrationsPage() {
  const [integrations, setIntegrations] = useState<Integration[]>([]);
  const [loading, setLoading] = useState(true);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [editing, setEditing] = useState<Integration | null>(null);
  const [apiKeyInput, setApiKeyInput] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    void loadIntegrations();
  }, []);

  async function loadIntegrations() {
    try {
      const res = await fetch("/api/integrations");
      if (!res.ok) throw new Error("Failed to load");
      setIntegrations(await res.json());
    } catch {
      toast({ title: "Error", description: "Could not load integrations", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }

  async function handleToggle(integration: Integration) {
    const next = !integration.isActive;
    setPendingId(integration.id);
    // Optimistic update.
    setIntegrations((prev) =>
      prev.map((i) => (i.id === integration.id ? { ...i, isActive: next } : i))
    );
    try {
      const res = await fetch(`/api/integrations/${integration.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive: next }),
      });
      if (!res.ok) throw new Error("Failed");
      const updated: Integration = await res.json();
      setIntegrations((prev) => prev.map((i) => (i.id === updated.id ? updated : i)));
      toast({
        title: next ? "Connected" : "Disconnected",
        description: `${integration.name} ${next ? "connected" : "disconnected"} successfully`,
      });
    } catch {
      // Roll back on failure.
      setIntegrations((prev) =>
        prev.map((i) => (i.id === integration.id ? { ...i, isActive: !next } : i))
      );
      toast({ title: "Error", description: "Could not update integration", variant: "destructive" });
    } finally {
      setPendingId(null);
    }
  }

  function openSettings(integration: Integration) {
    setEditing(integration);
    setApiKeyInput((integration.config?.apiKey as string) ?? "");
  }

  async function saveSettings() {
    if (!editing) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/integrations/${editing.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ config: { apiKey: apiKeyInput } }),
      });
      if (!res.ok) throw new Error("Failed");
      const updated: Integration = await res.json();
      setIntegrations((prev) => prev.map((i) => (i.id === updated.id ? updated : i)));
      toast({ title: "Saved", description: `${editing.name} settings updated` });
      setEditing(null);
    } catch {
      toast({ title: "Error", description: "Could not save settings", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  }

  const connectedCount = integrations.filter((i) => i.isActive).length;

  return (
    <div className="flex flex-col h-full">
      <Header title="Integrations" />
      <div className="flex-1 p-6 space-y-6 overflow-auto">
        <div className="flex items-center gap-2 mb-6">
          <Plug className="h-8 w-8 text-primary" />
          <div>
            <h2 className="text-2xl font-bold">Integrations</h2>
            <p className="text-muted-foreground">Connect your restaurant to third-party services</p>
          </div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-20 text-muted-foreground">
            <Loader2 className="h-6 w-6 animate-spin mr-2" />
            Loading integrations...
          </div>
        ) : (
          <>
            <div className="grid gap-4">
              <Card className="border-green-200 bg-green-50">
                <CardContent className="pt-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-semibold text-green-800">
                        {connectedCount} integrations connected
                      </p>
                      <p className="text-sm text-green-600">Your restaurant is connected to key services</p>
                    </div>
                    <Badge variant="success" className="bg-green-600">Active</Badge>
                  </div>
                </CardContent>
              </Card>
            </div>

            {CATEGORIES.map((category) => {
              const categoryIntegrations = integrations.filter((i) => i.type === category.id);
              if (categoryIntegrations.length === 0) return null;
              return (
                <div key={category.id}>
                  <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
                    <category.icon className="h-5 w-5" />
                    {category.name}
                  </h3>
                  <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                    {categoryIntegrations.map((integration) => {
                      const Icon = ICONS[integration.type] ?? Plug;
                      return (
                        <Card key={integration.id}>
                          <CardHeader className="pb-2">
                            <div className="flex items-center justify-between">
                              <CardTitle className="text-lg flex items-center gap-2">
                                <Icon className="h-5 w-5" />
                                {integration.name}
                              </CardTitle>
                              <Switch
                                checked={integration.isActive}
                                disabled={pendingId === integration.id}
                                onCheckedChange={() => handleToggle(integration)}
                              />
                            </div>
                            <CardDescription>{integration.config?.desc ?? ""}</CardDescription>
                          </CardHeader>
                          <CardContent>
                            <div className="flex items-center justify-between">
                              {integration.isActive ? (
                                <Badge variant="success">Connected</Badge>
                              ) : (
                                <Badge variant="outline">Not Connected</Badge>
                              )}
                              <Button variant="ghost" size="sm" onClick={() => openSettings(integration)}>
                                <Settings className="h-4 w-4" />
                              </Button>
                            </div>
                            {integration.isActive && integration.lastSync && (
                              <p className="mt-2 text-xs text-muted-foreground">
                                Last synced {new Date(integration.lastSync).toLocaleString()}
                              </p>
                            )}
                          </CardContent>
                        </Card>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </>
        )}
      </div>

      <Dialog open={editing !== null} onOpenChange={(open) => !open && setEditing(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing?.name} Settings</DialogTitle>
            <DialogDescription>
              Store the API key or access token used to connect to {editing?.name}.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2 py-2">
            <Label htmlFor="apiKey">API Key</Label>
            <Input
              id="apiKey"
              type="password"
              placeholder="Enter API key or access token"
              value={apiKeyInput}
              onChange={(e) => setApiKeyInput(e.target.value)}
            />
            {editing?.lastSync && (
              <p className="text-xs text-muted-foreground">
                Last synced {new Date(editing.lastSync).toLocaleString()}
              </p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditing(null)} disabled={saving}>
              Cancel
            </Button>
            <Button onClick={saveSettings} disabled={saving}>
              {saving && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
