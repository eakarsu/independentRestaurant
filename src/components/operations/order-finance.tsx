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
};
type Data = {
  canRefund: boolean;
  order: {
    status: string;
    paymentStatus: string;
    lastError: string | null;
    paymentAttempts: Receipt[];
    refunds: Receipt[];
  };
};
export function OrderFinance({ orderId }: { orderId: string }) {
  const [data, setData] = useState<Data | null>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [reference, setReference] = useState(""),
    [amount, setAmount] = useState(""),
    [reason, setReason] = useState("");
  const mutate = useMutationFetch();
  const load = useCallback(async () => {
    try {
      const r = await fetch(`/api/orders/${orderId}/finance`),
        j = await r.json();
      if (!r.ok) throw Error(j.error);
      setData(j);
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Receipts unavailable");
    }
  }, [orderId]);
  useEffect(() => {
    void load();
  }, [load]);
  async function act(body: Record<string, unknown>) {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const r = await mutate(`/api/orders/${orderId}/finance`, {
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
      <h3 className="font-semibold">Payments and refunds</h3>
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
          <label className="block text-sm">
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
          {data.canRefund && (
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
        </>
      )}
    </section>
  );
}
