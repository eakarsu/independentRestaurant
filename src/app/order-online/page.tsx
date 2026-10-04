"use client";
import Link from "next/link";
import { useSession, signOut } from "next-auth/react";
import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { useMutationFetch } from "@/components/operations/use-mutation-fetch";
import { OrderFinance } from "@/components/operations/order-finance";
type Item = {
  id: string;
  name: string;
  description: string | null;
  price: number;
  allergens: string[];
  modifierGroups: {
    modifierGroup: {
      id: string;
      name: string;
      required: boolean;
      minSelect: number;
      maxSelect: number;
      modifiers: { id: string; name: string; priceAdjustment: number }[];
    };
  }[];
};
type Line = { menuItemId: string; quantity: number; modifierIds: string[] };
type Order = {
  id: string;
  orderNumber: string;
  status: string;
  total: number;
  currency: string;
  pickupAt: string | null;
};
type Menu = {
  available: boolean;
  message?: string;
  restaurant?: {
    name: string;
    address: string;
    phone: string;
    timezone: string;
  };
  policy?: { noticeMinutes: number };
  menu?: Item[];
};
type Quote = {
  totalCents: number;
  subtotalCents: number;
  taxCents: number;
  tipCents: number;
  lines: {
    name: string;
    quantity: number;
    totalCents: number;
    modifiers: string[];
  }[];
};
const dollars = (c: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(
    c / 100,
  );
export default function OnlineOrdering() {
  const { data: session, status } = useSession(),
    customer = session?.user.role === "CUSTOMER",
    mutate = useMutationFetch();
  const [guestVerified, setGuestVerified] = useState(false);
  const [guestEmail, setGuestEmail] = useState('');
  const [guestFirstName, setGuestFirstName] = useState('');
  const [guestLastName, setGuestLastName] = useState('');
  const [guestPhone, setGuestPhone] = useState('');
  const [guestCode, setGuestCode] = useState('');
  const [challengeId, setChallengeId] = useState('');
  const [guestBusy, setGuestBusy] = useState(false);
  const canOrder = customer || guestVerified;
  const [menu, setMenu] = useState<Menu | null>(null),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [cart, setCart] = useState<Line[]>([]),
    [pickup, setPickup] = useState(""),
    [notes, setNotes] = useState(""),
    [tip, setTip] = useState("0"),
    [quote, setQuote] = useState<Quote | null>(null),
    [busy, setBusy] = useState(false),
    [orders, setOrders] = useState<Order[]>([]),
    [selected, setSelected] = useState("");
  const load = useCallback(async () => {
    try {
      const response = await fetch("/api/online-ordering"),
        result = await response.json();
      if (!response.ok) throw Error(result.error || "Menu unavailable");
      setMenu(result);
      if (canOrder) {
        const r = await fetch(customer ? "/api/online-ordering/orders" : '/api/online-ordering/guest/orders'),
          j = await r.json();
        if (!r.ok) throw Error(j.error);
        setOrders(j.orders);
      }
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to load");
    }
  }, [canOrder, customer]);
  useEffect(() => {
    if (customer) return;
    fetch('/api/online-ordering/guest/session').then(response => { setGuestVerified(response.ok); }).catch(() => setGuestVerified(false));
  }, [customer]);
  useEffect(() => {
    void load();
  }, [load]);
  useEffect(() => {
    setQuote(null);
  }, [cart, pickup, notes, tip]);
  useEffect(() => {
    const payment = new URLSearchParams(window.location.search).get('payment');
    if (payment === 'returned') setNotice('Checkout returned. Payment is confirmed only after a signed Stripe receipt or reconciliation. Open the order below to refresh receipts.');
    if (payment === 'cancelled') setNotice('Checkout was cancelled. Open the order below to review its current payment status.');
    const pendingOrder = window.sessionStorage.getItem('restaurant-guest-payment-order');
    if (pendingOrder) setSelected(pendingOrder);
  }, []);
  async function act(action: "quote" | "order" | "cancel", order?: Order) {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      let payload: Record<string, unknown>;
      if (action === "cancel") {
        const reason = window.prompt("Reason for cancellation");
        if (!reason) return;
        payload = { action, id: order!.id, reason };
      } else {
        if (!pickup) throw Error("Choose a pickup time");
        const value = Number(tip) * 100;
        if (
          !Number.isSafeInteger(Math.round(value)) ||
          Math.abs(value - Math.round(value)) > 0.00001 ||
          value < 0
        )
          throw Error("Use a valid tip amount with two decimal places");
        payload = {
          action,
          cart: {
            items: cart,
            pickupAt: new Date(pickup).toISOString(),
            notes,
            tipCents: Math.round(value),
          },
          ...(action === "order"
            ? { totalCents: quote!.totalCents, confirmed: true }
            : {}),
        };
      }
      const r = await mutate(customer ? "/api/online-ordering/orders" : '/api/online-ordering/guest/orders', {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        }),
        j = await r.json();
      if (!r.ok) throw Error(j.error);
      if (action === "quote") setQuote(j);
      else {
        setQuote(null);
        if (action === "order") {
          setCart([]);
          setSelected(j.id);
          setNotice(
            "Request saved. The restaurant must accept it before payment.",
          );
        } else setNotice("Request cancelled.");
        await load();
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Request failed");
    } finally {
      setBusy(false);
    }
  }
  async function requestGuestCode() {
    setGuestBusy(true); setError(''); setNotice('');
    try {
      const response = await fetch('/api/online-ordering/guest/challenge', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: guestEmail, firstName: guestFirstName, lastName: guestLastName, phone: guestPhone }) });
      const data = await response.json();
      if (!response.ok) throw Error(data.error || 'Could not request code');
      setChallengeId(data.challengeId); setNotice('Check your email for the one-time code. It expires in ten minutes.');
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not request code'); }
    finally { setGuestBusy(false); }
  }
  async function verifyGuestCode() {
    setGuestBusy(true); setError('');
    try {
      const response = await fetch('/api/online-ordering/guest/verify', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ challengeId, code: guestCode }) });
      const data = await response.json();
      if (!response.ok) throw Error(data.error || 'Could not verify code');
      setGuestVerified(true); setNotice('Email verified. You can review and request pickup.');
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not verify code'); }
    finally { setGuestBusy(false); }
  }
  async function endGuestSession() {
    await fetch('/api/online-ordering/guest/session', { method: 'DELETE' });
    setGuestVerified(false); setOrders([]); setQuote(null); setNotice('Guest session ended.');
  }
  return (
    <main className="mx-auto max-w-5xl p-6 space-y-6">
      <header className="flex justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-3xl font-bold">
            {menu?.restaurant?.name || "Restaurant"} · Pickup ordering
          </h1>
          {menu?.restaurant && (
            <p>
              {menu.restaurant.address} · {menu.restaurant.phone}
            </p>
          )}
        </div>
        {session ? (
          <Button
            variant="outline"
            onClick={() => signOut({ callbackUrl: "/order-online" })}
          >
            Sign out
          </Button>
        ) : (
          <Link className="underline" href="/login?callbackUrl=%2Forder-online">
            Customer sign in
          </Link>
        )}
      </header>
      {error && (
        <p role="alert" className="bg-red-50 text-red-800 p-3">
          {error}
        </p>
      )}
      {notice && (
        <p role="status" className="bg-green-50 p-3">
          {notice}
        </p>
      )}
      {!customer && <section className="border rounded p-4 space-y-3">
        <h2 className="text-xl font-semibold">Guest pickup checkout</h2>
        {guestVerified ? <><p>Your email is verified for this guest session. The restaurant must accept your request before card checkout. Payment remains unconfirmed until Stripe receipt reconciliation.</p><Button variant="outline" onClick={() => void endGuestSession()}>End guest session</Button></>
        : <><p>Enter your details and verify a one-time email code to request pickup without a restaurant password.</p>
          <div className="grid gap-2 sm:grid-cols-2"><label>First name<input className="block border rounded p-2 w-full" maxLength={80} value={guestFirstName} onChange={event => setGuestFirstName(event.target.value)}/></label><label>Last name<input className="block border rounded p-2 w-full" maxLength={80} value={guestLastName} onChange={event => setGuestLastName(event.target.value)}/></label><label>Email<input className="block border rounded p-2 w-full" type="email" maxLength={254} value={guestEmail} onChange={event => setGuestEmail(event.target.value)}/></label><label>Phone (optional)<input className="block border rounded p-2 w-full" maxLength={40} value={guestPhone} onChange={event => setGuestPhone(event.target.value)}/></label></div>
          <Button disabled={guestBusy || !guestFirstName.trim() || !guestLastName.trim() || !guestEmail.includes('@')} onClick={() => void requestGuestCode()}>Email verification code</Button>
          {challengeId && <div className="flex gap-2 items-end"><label>Six-digit code<input className="block border rounded p-2" inputMode="numeric" pattern="[0-9]{6}" maxLength={6} value={guestCode} onChange={event => setGuestCode(event.target.value)}/></label><Button disabled={guestBusy || !/^\d{6}$/.test(guestCode)} onClick={() => void verifyGuestCode()}>Verify email</Button></div>}
        </>}
      </section>}
      <Button variant="outline" onClick={load}>
        Refresh menu and orders
      </Button>
      {!menu && <p>Loading menu…</p>}
      {menu && !menu.available && <p>{menu.message}</p>}
      {menu?.available && (
        <>
          <p>
            Pickup requests need restaurant acceptance. Listed allergens are
            menu information; contact the restaurant about allergies and
            preparation requirements.
          </p>
          {!canOrder && (
            <p>
              {status === "authenticated"
                ? "Use a customer account to order."
                : "Verify your email above or sign in with a restaurant customer account to request pickup."}
            </p>
          )}
          <div className="grid md:grid-cols-2 gap-4">
            {menu.menu?.map((item) => {
              const line = cart.find((l) => l.menuItemId === item.id);
              return (
                <article key={item.id} className="border rounded p-4 space-y-2">
                  <h2 className="font-semibold text-xl">
                    {item.name} · {dollars(Math.round(item.price * 100))}
                  </h2>
                  <p>{item.description}</p>
                  <p className="text-sm">
                    Listed allergens:{" "}
                    {item.allergens.join(", ") ||
                      "No information listed; ask staff"}
                  </p>
                  {canOrder && (
                    <>
                      <label className="block">
                        Quantity{" "}
                        <input
                          className="border rounded p-2 w-20"
                          type="number"
                          min="0"
                          max="100"
                          value={line?.quantity || 0}
                          onChange={(e) => {
                            const quantity = Number(e.target.value);
                            setCart((old) =>
                              quantity > 0
                                ? old.some((l) => l.menuItemId === item.id)
                                  ? old.map((l) =>
                                      l.menuItemId === item.id
                                        ? { ...l, quantity }
                                        : l,
                                    )
                                  : [
                                      ...old,
                                      {
                                        menuItemId: item.id,
                                        quantity,
                                        modifierIds: [],
                                      },
                                    ]
                                : old.filter((l) => l.menuItemId !== item.id),
                            );
                          }}
                        />
                      </label>
                      {line &&
                        item.modifierGroups.map(({ modifierGroup: g }) => (
                          <fieldset className="border p-2" key={g.id}>
                            <legend>
                              {g.name} · choose{" "}
                              {Math.max(g.minSelect, g.required ? 1 : 0)}–
                              {g.maxSelect}
                            </legend>
                            {g.modifiers.map((m) => (
                              <label className="block" key={m.id}>
                                <input
                                  type="checkbox"
                                  checked={line.modifierIds.includes(m.id)}
                                  onChange={(e) =>
                                    setCart((old) =>
                                      old.map((l) =>
                                        l.menuItemId === item.id
                                          ? {
                                              ...l,
                                              modifierIds: e.target.checked
                                                ? [...l.modifierIds, m.id]
                                                : l.modifierIds.filter(
                                                    (id) => id !== m.id,
                                                  ),
                                            }
                                          : l,
                                      ),
                                    )
                                  }
                                />{" "}
                                {m.name}{" "}
                                {dollars(Math.round(m.priceAdjustment * 100))}
                              </label>
                            ))}
                          </fieldset>
                        ))}
                    </>
                  )}
                </article>
              );
            })}
          </div>
          {canOrder && (
            <section className="border rounded p-4 space-y-3">
              <h2 className="text-xl font-semibold">Review pickup request</h2>
              <label className="block">
                Pickup time in your device timezone (
                {Intl.DateTimeFormat().resolvedOptions().timeZone})
                <input
                  className="block border rounded p-2"
                  type="datetime-local"
                  value={pickup}
                  onChange={(e) => setPickup(e.target.value)}
                />
              </label>
              <p>
                Restaurant timezone: {menu.restaurant?.timezone}. Allow at least{" "}
                {menu.policy?.noticeMinutes} minutes. The quote checks opening
                hours.
              </p>
              <label className="block">
                Notes
                <textarea
                  className="block border rounded p-2 w-full"
                  maxLength={1000}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                />
              </label>
              <label className="block">
                Tip (USD)
                <input
                  className="block border rounded p-2"
                  type="number"
                  min="0"
                  step="0.01"
                  value={tip}
                  onChange={(e) => setTip(e.target.value)}
                />
              </label>
              <Button
                disabled={busy || !cart.length || !pickup}
                onClick={() => act("quote")}
              >
                Calculate current total
              </Button>
              {quote && (
                <div className="space-y-2 border-t pt-3">
                  {quote.lines.map((l, i) => (
                    <p key={i}>
                      {l.quantity} × {l.name} {l.modifiers.join(", ")} ·{" "}
                      {dollars(l.totalCents)}
                    </p>
                  ))}
                  <p>
                    Subtotal {dollars(quote.subtotalCents)} · Tax{" "}
                    {dollars(quote.taxCents)} · Tip {dollars(quote.tipCents)}
                  </p>
                  <p className="font-bold">Total {dollars(quote.totalCents)}</p>
                  <p>
                    Pickup:{" "}
                    {new Date(pickup).toLocaleString("en-US", {
                      timeZone: menu.restaurant?.timezone,
                    })}{" "}
                    ({menu.restaurant?.timezone})
                  </p>
                  <Button disabled={busy} onClick={() => act("order")}>
                    Confirm total and request pickup
                  </Button>
                </div>
              )}
            </section>
          )}
        </>
      )}
      {canOrder && (
        <section className="space-y-3">
          <h2 className="font-semibold text-xl">Your latest orders</h2>
          {orders.length === 0 && <p>No orders yet.</p>}
          {orders.map((order) => (
            <article className="border rounded p-3 space-y-2" key={order.id}>
              <button
                className="underline font-semibold"
                onClick={() =>
                  setSelected(selected === order.id ? "" : order.id)
                }
              >
                {order.orderNumber}
              </button>
              <p>
                {order.status === "PENDING"
                  ? "Awaiting restaurant acceptance"
                  : order.status}{" "}
                · {order.total.toFixed(2)} {order.currency}
              </p>
              {order.pickupAt && (
                <p>Pickup: {new Date(order.pickupAt).toLocaleString()}</p>
              )}
              {order.status === "PENDING" && (
                <Button
                  variant="outline"
                  disabled={busy}
                  onClick={() => act("cancel", order)}
                >
                  Cancel request
                </Button>
              )}
              {selected === order.id && <OrderFinance key={order.id+order.status} orderId={order.id} guest={!customer} />}
            </article>
          ))}
        </section>
      )}
    </main>
  );
}
