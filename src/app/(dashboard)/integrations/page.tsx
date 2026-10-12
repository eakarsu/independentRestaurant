"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { RecordLoadNotice } from "@/components/RecordLoadNotice";
import { readRecordResponse } from "@/lib/record-response";

type IntegrationState = {
  runtime: Record<string, boolean>;
  integrations: Array<{ id: string; name: string; type: string; isActive: boolean; lastSync: string | null }>;
};

export default function IntegrationsPage() {
  const [state, setState] = useState<IntegrationState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<IntegrationState['integrations'][number] | null>(null);
  const [editing, setEditing] = useState(false);
  const [enabled, setEnabled] = useState(false);
  const [saving, setSaving] = useState(false);
  async function load() { setLoading(true); try { const value = await readRecordResponse(await fetch('/api/integrations')) as IntegrationState; if (!value || !Array.isArray(value.integrations) || !value.runtime || typeof value.runtime !== 'object') throw new Error('The server returned an invalid connection registry. Retry loading.'); setState(value); setError(null); } catch (reason) { setError(reason instanceof Error ? reason.message : 'Unable to load providers'); } finally { setLoading(false); } }
  useEffect(() => { void load(); }, []);
  async function save() { if (!selected || saving) return; setSaving(true); try { await readRecordResponse(await fetch(`/api/integrations/${encodeURIComponent(selected.id)}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ isActive: enabled }) })); setSelected(null); setEditing(false); await load(); } catch (reason) { setError(reason instanceof Error ? reason.message : 'Connection update failed'); } finally { setSaving(false); } }
  return (
    <div className="space-y-6 p-8">
      <div>
        <h1 className="text-3xl font-bold">Provider connections</h1>
        <p className="text-muted-foreground">Credentials are read from the deployment secret store and are never returned to the browser.</p>
      </div>
      <RecordLoadNotice error={error || ''} busy={loading} onRetry={() => void load()} />
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
              <button type="button" key={integration.id} className="flex w-full items-center justify-between border-b py-2 text-left last:border-0 hover:bg-muted/50" onClick={() => { setSelected(integration); setEditing(false); setEnabled(integration.isActive); }}>
                <span>{integration.name} <span className="text-sm text-muted-foreground">({integration.type})</span></span>
                <Badge variant={integration.isActive ? "success" : "secondary"}>{integration.isActive ? "Enabled" : "Disabled"}</Badge>
              </button>
            ))}
          </CardContent>
        </Card>
      ) : null}
      <Dialog open={Boolean(selected)} onOpenChange={open => { if (!open && !saving) setSelected(null); }}><DialogContent>{selected && <><DialogHeader><DialogTitle>{selected.name}</DialogTitle><DialogDescription>Saved provider registry · {selected.type}</DialogDescription></DialogHeader><p>{selected.isActive ? 'Enabled' : 'Disabled'} · Last recorded sync: {selected.lastSync ? new Date(selected.lastSync).toLocaleString() : 'Not recorded'}</p><p className="text-sm text-muted-foreground">Registry status is configuration, not proof of a provider connection. Credentials stay in the deployment secret store. Connection history is retained.</p>{editing && <label className="flex gap-2"><input type="checkbox" checked={enabled} disabled={saving} onChange={event => setEnabled(event.target.checked)} />Enable this integration</label>}{error && <p role="alert">{error}</p>}<div className="flex justify-end gap-2">{editing ? <Button disabled={saving} onClick={() => void save()}>{saving ? 'Saving…' : 'Save connection status'}</Button> : <Button onClick={() => setEditing(true)}>Edit</Button>}<Button variant="outline" disabled title="Connection history is retained; disable the registry entry instead">Delete</Button><Button variant="outline" disabled={saving} onClick={() => { setSelected(null); setEditing(false); }}>Cancel</Button></div></>}</DialogContent></Dialog>
    </div>
  );
}
