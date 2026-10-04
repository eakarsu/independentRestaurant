"use client";
import { useEffect, useState, useCallback } from "react";
import { useMutationFetch } from "./use-mutation-fetch";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
type Receipt = {
  id: string;
  status: string;
  amountCents: number;
  currency: string;
  providerRef: string | null;
  failureMessage?: string;
  reason?: string;
  provider?: string;
};
type CapturedPayment = { id: string; amount: number; method: string; status: string; reference: string | null };
type Data = {
  canRefund: boolean;
  canRecordCash?: boolean;
  checkoutEnabled?: boolean;
  splitCheckoutEnabled?: boolean;
  totalCents?: number;
  capturedCashCents?: number;
  capturedCardCents?: number;
  refundedCashCents?: number;
  order: {
    status: string;
    paymentStatus: string;
    lastError: string | null;
    paymentAttempts: Receipt[];
    refunds: Receipt[];
    payments?: CapturedPayment[];
  };
};
const money = (cents: number) => `$${(cents / 100).toFixed(2)}`;
const inputCents = (value: string) => {
  if (!/^\d+(?:\.\d{1,2})?$/.test(value)) return null;
  const cents = Math.round(Number(value) * 100);
  return Number.isSafeInteger(cents) ? cents : null;
};
export function OrderFinance({ orderId, guest = false }: { orderId: string; guest?: boolean }) {
  const endpoint = guest ? `/api/online-ordering/guest/orders/${orderId}/finance` : `/api/orders/${orderId}/finance`;
  const [data, setData] = useState<Data | null>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [reference, setReference] = useState(""),
    [amount, setAmount] = useState(""),
    [reason, setReason] = useState(""),
    [cashAmount, setCashAmount] = useState(''),
    [cashReceived, setCashReceived] = useState(''),
    [cashRefundAmount, setCashRefundAmount] = useState(''),
    [cashRefundReason, setCashRefundReason] = useState('');
  const mutate = useMutationFetch();
  const load = useCallback(async () => {
    try {
      const r = await fetch(endpoint),
        j = await r.json();
      if (!r.ok) throw Error(j.error);
      setData(j);
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Receipts unavailable");
    }
  }, [endpoint]);
  useEffect(() => {
    void load();
  }, [load]);
  async function act(body: Record<string, unknown>) {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const r = await mutate(endpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        }),
        j = await r.json();
      if (!r.ok) throw Error(j.error);
      if (j.redirectUrl) {
        const url = new URL(j.redirectUrl);
        if (url.protocol !== "https:" || url.hostname !== "checkout.stripe.com")
          throw Error("Unexpected payment destination");
        if (guest) window.sessionStorage.setItem('restaurant-guest-payment-order', orderId);
        window.location.assign(url.href);
      }
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Outcome not confirmed");
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="border rounded p-3 space-y-3">
      <h3 className="font-semibold">{guest ? 'Card checkout and receipts' : 'Payments and refunds'}</h3>
      {error && (
        <p role="alert" className="text-red-700">
          {error}
        </p>
      )}
      <Button size="sm" variant="outline" onClick={load}>
        Refresh receipts
      </Button>
      {data && (
        <>
          <p>{data.order.paymentStatus}</p>
          {typeof data.totalCents === 'number' && <p className="text-sm">Order total {money(data.totalCents)} · cash collected {money(data.capturedCashCents || 0)} · verified card {money(data.capturedCardCents || 0)} · card balance {money(Math.max(0, data.totalCents - (data.capturedCashCents || 0) - (data.capturedCardCents || 0)))}</p>}
          {!!data.refundedCashCents && <p className="text-sm">Cash returned {money(data.refundedCashCents)}</p>}
          {guest && data.checkoutEnabled === false && <p className="text-sm text-amber-700">Guest card checkout is not yet enabled. Ask the restaurant how to pay after it accepts the order.</p>}
          {!guest && (data.capturedCashCents || 0) > 0 && data.splitCheckoutEnabled === false && <p className="text-sm text-amber-700">Split card checkout awaits accepted Stripe test-mode credentials and a signed webhook.</p>}
          {data.order.lastError && <p>{data.order.lastError}</p>}
          <p className="text-sm">
            A checkout return does not confirm payment. Pending or unknown
            requests must be reconciled before another payment or refund.
          </p>
          {[
            "CONFIRMED",
            "PAYMENT_PENDING",
            "PAYMENT_FAILED",
            "PREPARING",
            "READY",
            "SERVED",
            "COMPLETED",
          ].includes(data.order.status) &&
            (!guest || data.checkoutEnabled !== false) &&
            (!data.capturedCashCents || data.splitCheckoutEnabled !== false) &&
            !["PAID", "PARTIALLY_REFUNDED", "REFUNDED"].includes(
              data.order.paymentStatus,
            ) && (
              <Button
                size="sm"
                disabled={busy}
                onClick={() => act({ action: "pay" })}
              >
                Open or resume card checkout
              </Button>
            )}
          {!guest && data.canRecordCash && <div className="space-y-2 rounded border p-3 text-sm">
            <p className="font-medium">Split cash and card</p>
            {data.splitCheckoutEnabled ? <><p>Record cash actually received. Card checkout will charge the remaining server-priced balance.</p>
              <label className="block">Cash applied to order<Input type="number" min="0.01" step="0.01" value={cashAmount} onChange={event => setCashAmount(event.target.value)} /></label>
              <label className="block">Cash handed over<Input type="number" min="0.01" step="0.01" value={cashReceived} onChange={event => setCashReceived(event.target.value)} /></label>
              <Button size="sm" disabled={busy || inputCents(cashAmount) === null || inputCents(cashReceived) === null || inputCents(cashAmount)! <= 0 || inputCents(cashAmount)! >= (data.totalCents || 0) || inputCents(cashReceived)! < inputCents(cashAmount)!} onClick={() => { if (window.confirm(`Confirm ${cashAmount} cash applied to this order?`)) void act({ action: 'cash', amountCents: inputCents(cashAmount), cashReceivedCents: inputCents(cashReceived), confirmed: true }); }}>Record cash portion</Button>
            </> : <p>Cash split is available after the Stripe test-mode checkout and webhook are accepted.</p>}
          </div>}
          {data.order.payments?.filter(payment => payment.status === 'completed').map(payment => <p className="text-sm" key={payment.id}>{payment.method === 'cash' ? 'Cash receipt' : 'Card receipt'} {money(Math.round(payment.amount * 100))} · {payment.reference}</p>)}
          {[
            ...data.order.paymentAttempts.map((r) => ({
              ...r,
              kind: "payment",
            })),
            ...data.order.refunds.map((r) => ({ ...r, kind: "refund" })),
          ].map((r) => (
            <div className="border-t pt-2 text-sm break-words" key={r.id}>
              {r.kind}: {(r.amountCents / 100).toFixed(2)} {r.currency} ·{" "}
              {r.status}
              {r.failureMessage && <p>{r.failureMessage}</p>}
              <p>{r.providerRef || "Provider reference not yet confirmed"}</p>
              {r.kind === "refund" &&
                r.status === "PENDING" &&
                r.providerRef &&
                data.canRefund && (
                  <Button
                    size="sm"
                    disabled={busy}
                    onClick={() =>
                      act({
                        action: "refund-reconcile",
                        reference: r.providerRef,
                      })
                    }
                  >
                    Reconcile refund
                  </Button>
                )}
              {r.kind === "payment" &&
                (!guest || data.checkoutEnabled !== false) &&
                r.providerRef?.startsWith("cs_") &&
                r.status !== "SUCCEEDED" && (
                  <Button
                    size="sm"
                    disabled={busy}
                    onClick={() =>
                      act({ action: "reconcile", reference: r.providerRef })
                    }
                  >
                    Reconcile checkout
                  </Button>
                )}
            </div>
          ))}
          {!guest && <><label className="block text-sm">
            Provider checkout or refund ID
            <Input
              value={reference}
              onChange={(e) => setReference(e.target.value)}
              placeholder="cs_… or re_…"
            />
          </label>
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              variant="outline"
              disabled={busy || !reference}
              onClick={() =>
                act({
                  action: reference.startsWith("re_")
                    ? "refund-reconcile"
                    : "reconcile",
                  reference,
                })
              }
            >
              Reconcile reference
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={busy || !reference.startsWith("cs_")}
              onClick={() => {
                if (window.confirm("Expire this open provider checkout?"))
                  void act({ action: "expire", reference });
              }}
            >
              Expire checkout
            </Button>
          </div>
          </>}
          {data.canRefund && (data.capturedCardCents || 0) > 0 && ['COMPLETED', 'CANCELLED', 'EXCEPTION'].includes(data.order.status) && (
            <details>
              <summary>Request original-card refund</summary>
              <label className="block text-sm">
                Amount
                <Input
                  type="number"
                  min="0.01"
                  step="0.01"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                />
              </label>
              <label className="block text-sm">
                Reason
                <Input
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                />
              </label>
              <Button
                size="sm"
                disabled={busy || !amount || reason.trim().length < 3}
                onClick={() => {
                  if (
                    window.confirm(
                      "Request this refund to the original verified card payment?",
                    )
                  )
                    void act({
                      action: "refund",
                      amountCents: Math.round(Number(amount) * 100),
                      reason,
                      confirmed: true,
                    });
                }}
              >
                Request refund
              </Button>
            </details>
          )}
          {!guest && data.canRefund && ['COMPLETED', 'CANCELLED', 'EXCEPTION'].includes(data.order.status) && (data.capturedCashCents || 0) > (data.refundedCashCents || 0) && <details className="space-y-2"><summary>Record original cash refund</summary>
            <p className="text-sm">Up to {money((data.capturedCashCents || 0) - (data.refundedCashCents || 0))} can be returned from the recorded cash portion.</p>
            <label className="block text-sm">Cash returned<Input type="number" min="0.01" step="0.01" value={cashRefundAmount} onChange={event => setCashRefundAmount(event.target.value)} /></label>
            <label className="block text-sm">Reason<Input value={cashRefundReason} onChange={event => setCashRefundReason(event.target.value)} /></label>
            <Button size="sm" disabled={busy || !inputCents(cashRefundAmount) || inputCents(cashRefundAmount)! > (data.capturedCashCents || 0) - (data.refundedCashCents || 0) || cashRefundReason.trim().length < 3} onClick={() => { if (window.confirm('Confirm this cash was actually returned to the customer?')) void act({ action: 'cash-refund', amountCents: inputCents(cashRefundAmount), reason: cashRefundReason, cashReturnedConfirmed: true }); }}>Record cash returned</Button>
          </details>}
        </>
      )}
    </section>
  );
}
