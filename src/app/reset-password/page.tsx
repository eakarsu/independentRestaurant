"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export default function ResetPasswordPage() {
  const [token, setToken] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  useEffect(() => setToken(new URLSearchParams(window.location.search).get("token") ?? ""), []);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setLoading(true);
    const response = await fetch(token ? "/api/auth/reset-password/confirm" : "/api/auth/reset-password", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(token ? { token, password } : { email }),
    });
    const body = await response.json();
    setMessage(body.message ?? (response.ok ? "Password reset. Sign in with your new password." : body.error ?? "Request failed"));
    setLoading(false);
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-muted p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>{token ? "Choose a new password" : "Reset password"}</CardTitle>
          <CardDescription>{token ? "The one-time link expires after 30 minutes." : "We will send a one-time link if the account exists."}</CardDescription>
        </CardHeader>
        <CardContent>
          <form className="space-y-4" onSubmit={submit}>
            {token ? (
              <div className="space-y-2"><Label htmlFor="password">New password</Label><Input id="password" type="password" minLength={14} maxLength={200} value={password} onChange={(event) => setPassword(event.target.value)} required /></div>
            ) : (
              <div className="space-y-2"><Label htmlFor="email">Email</Label><Input id="email" type="email" value={email} onChange={(event) => setEmail(event.target.value)} required /></div>
            )}
            <Button className="w-full" disabled={loading}>{loading ? "Submitting…" : "Continue"}</Button>
          </form>
          {message && <p className="mt-4 text-sm" role="status">{message}</p>}
          <Link className="mt-6 block text-center text-sm text-primary" href="/login">Back to sign in</Link>
        </CardContent>
      </Card>
    </main>
  );
}
