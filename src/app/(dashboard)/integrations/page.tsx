"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

type IntegrationState = {
  runtime: Record<string, boolean>;
  integrations: Array<{ id: string; name: string; type: string; isActive: boolean; lastSync: string | null }>;
};

export default function IntegrationsPage() {
  const [state, setState] = useState<IntegrationState | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    fetch("/api/integrations")
      .then(async (response) => {
        if (!response.ok) throw new Error((await response.json()).error ?? "Unable to load providers");
        return response.json() as Promise<IntegrationState>;
      })
      .then(setState)
      .catch((reason: Error) => setError(reason.message));
  }, []);
  return (
    <div className="space-y-6 p-8">
      <div>
        <h1 className="text-3xl font-bold">Provider connections</h1>
        <p className="text-muted-foreground">Credentials are read from the deployment secret store and are never returned to the browser.</p>
      </div>
      {error && <p className="text-destructive">{error}</p>}
      <div className="grid gap-4 md:grid-cols-2">
        {state && Object.entries(state.runtime).map(([name, configured]) => (
          <Card key={name}>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="capitalize">{name}</CardTitle>
                <Badge variant={configured ? "success" : "destructive"}>{configured ? "Configured" : "Blocked"}</Badge>
              </div>
              <CardDescription>{configured ? "Runtime prerequisites are present." : "Required deployment secrets are missing."}</CardDescription>
            </CardHeader>
          </Card>
        ))}
      </div>
      {state?.integrations.length ? (
        <Card>
          <CardHeader><CardTitle>Connection audit registry</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {state.integrations.map((integration) => (
              <div key={integration.id} className="flex items-center justify-between border-b py-2 last:border-0">
                <span>{integration.name} <span className="text-sm text-muted-foreground">({integration.type})</span></span>
                <Badge variant={integration.isActive ? "success" : "secondary"}>{integration.isActive ? "Enabled" : "Disabled"}</Badge>
              </div>
            ))}
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
