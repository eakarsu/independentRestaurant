'use client';

import { useCallback, useEffect, useState } from 'react';
import { Header } from '@/components/layout/header';
import { Button } from '@/components/ui/button';

type Override = { quantity: number; reason: string; actorId: string; recordedAt: string };
type Plan = {
  method: string; historyStart: string; historyEnd: string; salesRowsIncluded: number; salesTruncated: boolean;
  wasteRowsIncluded: number; wasteTruncated: boolean; updatedAt: string | null;
  overrides: Record<string, Override>; limitations: string[];
  waste: { ingredientId: string; name: string; unit: string; quantity: number; cost: number }[];
  items: { id: string; name: string; unitsSold: number; backtestMeanAbsoluteError: number; days: { date: string; baselineUnits: number; suggestedPrep: number }[] }[];
};
const integer = (value: string) => Number(value);
export default function PrepPlanningPage() {
  const [plan, setPlan] = useState<Plan | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [edit, setEdit] = useState<{ menuItemId: string; date: string; quantity: string; reason: string } | null>(null);
  const load = useCallback(async () => {
    try {
      const response = await fetch('/api/operations/prep-plan');
      const data = await response.json();
      if (!response.ok) throw Error(data.error || 'Plan unavailable');
      setPlan(data);
      setError('');
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Plan unavailable'); }
  }, []);
  useEffect(() => { void load(); }, [load]);
  async function save() {
    if (!edit || !plan || busy) return;
    setBusy(true); setError(''); setNotice('');
    try {
      const response = await fetch('/api/operations/prep-plan', { method: 'PUT', headers: { 'Content-Type': 'application/json', 'Idempotency-Key': crypto.randomUUID() }, body: JSON.stringify({ ...edit, quantity: integer(edit.quantity), updatedAt: plan.updatedAt }) });
      const data = await response.json();
      if (!response.ok) throw Error(data.error || 'Could not save adjustment');
      setEdit(null); setNotice('Kitchen adjustment saved with an audit record. No order or stock was changed.');
      await load();
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not save adjustment'); }
    finally { setBusy(false); }
  }
  return <div><Header title="Prep planning"/><main className="p-6 space-y-6">
    <p>Advisory quantities from completed and served orders. Kitchen staff choose final prep quantities. These suggestions do not place orders or change inventory.</p>
    {error && <p role="alert" className="text-red-700">{error}</p>}{notice && <p role="status" className="text-green-700">{notice}</p>}
    <Button variant="outline" onClick={() => void load()}>Refresh evidence</Button>
    {!plan && !error && <p>Loading plan…</p>}
    {plan && <>
      <section className="rounded border p-4 space-y-2"><h2 className="font-semibold">Evidence and measured error</h2>
        <p>{plan.method}. History: {plan.historyStart} to {plan.historyEnd} UTC. {plan.salesRowsIncluded} order item rows.</p>
        {plan.salesTruncated && <p className="text-amber-700">Sales record limit reached; this plan may omit orders.</p>}
        <p>Mean absolute error is the average difference between historical actual units and the forecast calculated without those days.</p>
        <ul className="list-disc pl-5">{plan.limitations.map((limitation) => <li key={limitation}>{limitation}</li>)}</ul>
      </section>
      <section className="space-y-3"><h2 className="text-xl font-semibold">Next seven UTC days</h2>
        {!plan.items.length && <p>No active menu items to forecast.</p>}
        {plan.items.map((item) => <article key={item.id} className="rounded border p-4 space-y-3"><h3 className="font-semibold">{item.name}</h3>
          <p>Units sold in history: {item.unitsSold} · Backtest mean absolute error: {item.backtestMeanAbsoluteError.toFixed(2)} units/day</p>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">{item.days.map((day) => { const override = plan.overrides[`${item.id}:${day.date}`]; return <div key={day.date} className="rounded bg-muted p-3">
            <strong>{day.date}</strong><p>Baseline: {day.baselineUnits.toFixed(2)} · Suggested: {day.suggestedPrep}</p>
            <p>Kitchen decision: {override ? `${override.quantity} (${override.reason})` : 'No adjustment recorded'}</p>
            <Button size="sm" variant="outline" onClick={() => setEdit({ menuItemId: item.id, date: day.date, quantity: String(override?.quantity ?? day.suggestedPrep), reason: override?.reason || '' })}>Adjust</Button>
          </div>; })}</div>
        </article>)}</section>
      {edit && <section className="rounded border p-4 space-y-3"><h2 className="font-semibold">Adjust prep quantity for {edit.date}</h2>
        <label className="block">Final quantity<input className="block border rounded p-2" type="number" min="0" max="10000" step="1" value={edit.quantity} onChange={(event) => setEdit({ ...edit, quantity: event.target.value })}/></label>
        <label className="block">Reason<input className="block border rounded p-2 w-full" minLength={5} maxLength={500} value={edit.reason} onChange={(event) => setEdit({ ...edit, reason: event.target.value })}/></label>
        <Button disabled={busy || !Number.isInteger(integer(edit.quantity)) || integer(edit.quantity) < 0 || edit.reason.trim().length < 5} onClick={() => void save()}>{busy ? 'Saving…' : 'Save kitchen decision'}</Button>
        <Button variant="ghost" onClick={() => setEdit(null)}>Cancel</Button>
      </section>}
      <section className="space-y-2"><h2 className="text-xl font-semibold">Recorded ingredient waste</h2><p>{plan.wasteRowsIncluded} waste records in the same 56 day period. Ingredient waste is shown for review and is not automatically converted into menu prep quantities.</p>
        {plan.wasteTruncated && <p className="text-amber-700">Waste record limit reached.</p>}
        {!plan.waste.length && <p>No ingredient waste recorded.</p>}
        {plan.waste.map((row) => <p key={row.ingredientId}>{row.name}: {row.quantity.toFixed(2)} {row.unit} · ${row.cost.toFixed(2)} recorded cost</p>)}
      </section>
    </>}
  </main></div>;
}
