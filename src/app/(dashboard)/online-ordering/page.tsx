"use client";
import Link from "next/link";
import { useState, useEffect } from "react";
import { Header } from "@/components/layout/header";
import { Button } from "@/components/ui/button";
import { useOperation } from "@/components/operations/use-operation";
type Policy = {
  enabled: boolean;
  noticeMinutes: number;
  horizonDays: number;
  maxPendingPerCustomer: number;
  reviewed: true;
};
export default function Page() {
  const settings = useOperation<{ value: Policy; updatedAt: string | null }>(
      "/api/operations/online-ordering",
    ),
    access = useOperation<{
      customers: {
        id: string;
        firstName: string;
        lastName: string;
        email: string | null;
        userId: string | null;
      }[];
    }>("/api/operations/customer-access"),
    [policy, setPolicy] = useState<Policy | null>(null),
    [customerId, setCustomer] = useState(""),
    [password, setPassword] = useState(""),
    [checked, setChecked] = useState(false);
  useEffect(() => {
    if (settings.data) setPolicy(settings.data.value);
  }, [settings.data]);
  return (
    <>
      <Header title="Online ordering setup" />
      <main className="p-6 max-w-4xl space-y-6">
        <p>
          <Link className="underline" href="/order-online" target="_blank">
            Open customer pickup page
          </Link>{" "}
          · Share this page URL or encode it in your printed QR menu.
        </p>
        {settings.error && <p role="alert">{settings.error}</p>}
        {policy && (
          <form
            className="border rounded p-4 space-y-3"
            onSubmit={async (e) => {
              e.preventDefault();
              await settings.save(
                { value: policy, updatedAt: settings.data!.updatedAt },
                "PUT",
              );
            }}
          >
            <h2 className="font-semibold text-xl">Pickup settings</h2>
            <p>
              Save your restaurant hours and explicit tax configuration before
              enabling pickup requests. Staff must accept each request in Orders
              before the customer can pay.
            </p>
            <label className="block">
              <input
                type="checkbox"
                checked={policy.enabled}
                onChange={(e) =>
                  setPolicy({ ...policy, enabled: e.target.checked })
                }
              />{" "}
              Accept online pickup requests
            </label>
            {(
              ["noticeMinutes", "horizonDays", "maxPendingPerCustomer"] as const
            ).map((key) => (
              <label className="block" key={key}>
                {key === "noticeMinutes"
                  ? "Minimum preparation notice (minutes)"
                  : key === "horizonDays"
                    ? "Maximum days ahead"
                    : "Maximum pending requests per customer"}
                <input
                  className="block border rounded p-2"
                  type="number"
                  required
                  min="1"
                  value={policy[key]}
                  onChange={(e) =>
                    setPolicy({ ...policy, [key]: Number(e.target.value) })
                  }
                />
              </label>
            ))}
            <Button disabled={settings.busy}>Save reviewed settings</Button>
          </form>
        )}
        <form
          className="border rounded p-4 space-y-3"
          onSubmit={async (e) => {
            e.preventDefault();
            if (
              await access.save({
                customerId,
                password,
                identityReviewed: checked,
              })
            ) {
              setPassword("");
              setChecked(false);
            }
          }}
        >
          <h2 className="font-semibold text-xl">Customer account access</h2>
          <p>
            Create the customer profile first. After verifying the customer's
            identity, create their login and share it through your agreed
            private channel.
          </p>
          {access.error && <p role="alert">{access.error}</p>}
          <label className="block">
            Customer
            <select
              className="block border rounded p-2 w-full"
              value={customerId}
              onChange={(e) => setCustomer(e.target.value)}
            >
              <option value="">Choose a customer without an account</option>
              {access.data?.customers
                .filter((c) => !c.userId && c.email)
                .map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.firstName} {c.lastName} · {c.email}
                  </option>
                ))}
            </select>
          </label>
          <label className="block">
            Initial password (14–72 characters)
            <input
              className="block border rounded p-2 w-full"
              type="password"
              autoComplete="new-password"
              minLength={14}
              maxLength={72}
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </label>
          <label className="block">
            <input
              type="checkbox"
              required
              checked={checked}
              onChange={(e) => setChecked(e.target.checked)}
            />{" "}
            I verified this customer's identity and email ownership.
          </label>
          <Button disabled={access.busy || !customerId}>
            Create customer login
          </Button>
        </form>
      </main>
    </>
  );
}
