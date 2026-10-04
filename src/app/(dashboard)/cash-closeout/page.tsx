'use client';

import { useCallback, useEffect, useState } from 'react';
import { Header } from '@/components/layout/header';
import { Button } from '@/components/ui/button';

type Closeout = { date: string; currency: string; openingFloatCents: number; paidOutCents: number; countedCents: number; receivedCents: number; refundedCents?: number; netReceivedCents?: number; expectedCents: number; varianceCents: number; note: string; closedAt: string; closedById: string; paymentDigest: string };
type View = { date: string; currency: string; timezone: string; ledger: { paymentCount: number; refundCount: number; receivedCents: number; refundedCents: number; netReceivedCents: number; paymentDigest: string }; closeout: Closeout | null; sourceChanged: boolean; definitions: string[] };
const dollars = (cents: number, currency: string) => new Intl.NumberFormat(undefined, { style: 'currency', currency }).format(cents / 100);
const parseCents = (value: string) => { if (!/^\d+(?:\.\d{1,2})?$/.test(value)) return null; const cents = Math.round(Number(value) * 100); return Number.isSafeInteger(cents) ? cents : null; };
export default function CashCloseoutPage() {
  const [date, setDate] = useState('');
  const [currency, setCurrency] = useState('USD');
  const [view, setView] = useState<View | null>(null);
  const [openingFloat, setOpeningFloat] = useState('0.00');
  const [paidOut, setPaidOut] = useState('0.00');
  const [counted, setCounted] = useState('0.00');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const load = useCallback(async () => {
    try {
      const query = new URLSearchParams({ currency, ...(date ? { date } : {}) });
      const response = await fetch(`/api/operations/cash-closeout?${query}`);
      const data = await response.json();
      if (!response.ok) throw Error(data.error || 'Cash ledger unavailable');
      setView(data); setDate(data.date); setError('');
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Cash ledger unavailable'); }
  }, [currency, date]);
  useEffect(() => { void load(); }, [load]);
  const openingCents = parseCents(openingFloat);
  const paidOutCents = parseCents(paidOut);
  const countedCents = parseCents(counted);
  const expectedCents = view && openingCents !== null && paidOutCents !== null ? openingCents + view.ledger.netReceivedCents - paidOutCents : null;
  const varianceCents = expectedCents !== null && countedCents !== null ? countedCents - expectedCents : null;
  async function close() {
    if (!view || openingCents === null || paidOutCents === null || countedCents === null || busy) return;
    setBusy(true); setError(''); setNotice('');
    try {
      const response = await fetch('/api/operations/cash-closeout', { method: 'POST', headers: { 'Content-Type': 'application/json', 'Idempotency-Key': crypto.randomUUID() }, body: JSON.stringify({ date: view.date, currency: view.currency, openingFloatCents: openingCents, paidOutCents, countedCents, note }) });
      const data = await response.json();
      if (!response.ok) throw Error(data.error || 'Closeout failed');
      setNotice('Count saved with a manager audit record.');
      await load();
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Closeout failed'); }
    finally { setBusy(false); }
  }
  return <div><Header title="Cash closeout"/><main className="p-6 space-y-5 max-w-3xl">
    <p>Count a restaurant calendar day against recorded cash received and returned. A closeout saves a fixed snapshot; it does not create a payment or transfer money.</p>
    <div className="flex flex-wrap gap-3 items-end"><label>Day<input className="block border rounded p-2" type="date" value={date} onChange={event => setDate(event.target.value)}/></label><label>Currency<input className="block border rounded p-2 w-24" maxLength={3} value={currency} onChange={event => setCurrency(event.target.value.toUpperCase())}/></label><Button variant="outline" onClick={() => void load()}>Refresh ledger</Button></div>
    {error && <p role="alert" className="text-red-700">{error}</p>}{notice && <p role="status" className="text-green-700">{notice}</p>}
    {view && <><section className="rounded border p-4 space-y-2"><h2 className="font-semibold">Recorded cash for {view.date} ({view.timezone})</h2><p>{view.ledger.paymentCount} receipts · {dollars(view.ledger.receivedCents, view.currency)} received</p><p>{view.ledger.refundCount} refunds · {dollars(view.ledger.refundedCents, view.currency)} returned · net {dollars(view.ledger.netReceivedCents, view.currency)}</p>{view.definitions.map(line => <p key={line} className="text-sm text-muted-foreground">{line}</p>)}</section>
      {view.closeout ? <section className="rounded border p-4 space-y-2"><h2 className="font-semibold">Closed {new Date(view.closeout.closedAt).toLocaleString()}</h2><p>Opening float: {dollars(view.closeout.openingFloatCents, view.currency)} · Other cash paid out: {dollars(view.closeout.paidOutCents, view.currency)}</p><p>Expected: {dollars(view.closeout.expectedCents, view.currency)} · Counted: {dollars(view.closeout.countedCents, view.currency)} · Variance: {dollars(view.closeout.varianceCents, view.currency)}</p><p>Manager note: {view.closeout.note || 'None'}</p>{view.sourceChanged && <p className="text-red-700" role="alert">Cash receipts or refunds changed since this count. Review the cash ledger and this closeout.</p>}</section>
      : <section className="rounded border p-4 space-y-3"><h2 className="font-semibold">Manager count</h2><div className="grid gap-3 sm:grid-cols-3"><label>Opening float<input className="block border rounded p-2 w-full" inputMode="decimal" value={openingFloat} onChange={event => setOpeningFloat(event.target.value)}/></label><label>Other cash paid out<input className="block border rounded p-2 w-full" inputMode="decimal" value={paidOut} onChange={event => setPaidOut(event.target.value)}/></label><label>Counted cash<input className="block border rounded p-2 w-full" inputMode="decimal" value={counted} onChange={event => setCounted(event.target.value)}/></label></div><p>Expected: {expectedCents === null ? 'Enter valid amounts' : dollars(expectedCents, view.currency)} · Variance: {varianceCents === null ? '—' : dollars(varianceCents, view.currency)}</p><label>Reason for other cash paid out or variance<textarea className="block border rounded p-2 w-full" maxLength={1000} value={note} onChange={event => setNote(event.target.value)}/></label><Button disabled={busy || openingCents === null || paidOutCents === null || countedCents === null || expectedCents === null || expectedCents < 0 || ((paidOutCents > 0 || varianceCents !== 0) && note.trim().length < 5)} onClick={() => void close()}>{busy ? 'Saving…' : 'Close cash day'}</Button></section>}
    </>}
  </main></div>;
}
