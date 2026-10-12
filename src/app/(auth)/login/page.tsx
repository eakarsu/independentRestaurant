"use client";

import { useState, useEffect, useRef, Suspense } from "react";
import { signIn } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { UtensilsCrossed, Loader2, AlertCircle } from "lucide-react";

function LoginForm() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [pending, setPending] = useState<'fill' | 'demo' | 'manual' | null>(null);
  const [demoEnabled, setDemoEnabled] = useState(false);
  const [demoChecked, setDemoChecked] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const active = useRef<AbortController | null>(null);
  const loading = pending === 'manual';
  const demoLoading = pending === 'demo';
  const router = useRouter();
  const searchParams = useSearchParams();
  const callbackUrl = searchParams.get("callbackUrl") || "/dashboard";

  useEffect(() => {
    const controller = new AbortController();
    fetch('/api/auth/demo-credentials?status=1', { cache: 'no-store', signal: controller.signal })
      .then(async response => response.ok ? response.json() : { enabled: false })
      .then(result => { if (!controller.signal.aborted) setDemoEnabled(result.enabled === true); }).catch(() => {})
      .finally(() => { if (!controller.signal.aborted) setDemoChecked(true); });
    return () => { controller.abort(); active.current?.abort(); active.current = null; };
  }, []);

  const authenticate = async (mode: 'fill' | 'demo' | 'manual') => {
    if (active.current || (mode !== 'manual' && !demoEnabled)) return;
    const controller = new AbortController();
    active.current = controller;
    setPending(mode);
    setError("");
    setNotice("");
    try {
      let credentials = { email, password };
      if (mode !== 'manual') {
        const response = await fetch("/api/auth/demo-credentials", { credentials: 'same-origin', cache: "no-store", signal: controller.signal });
        const configured = await response.json().catch(() => null);
        if (!response.ok || configured?.enabled !== true || typeof configured.email !== 'string' || !configured.email.trim() || typeof configured.password !== 'string' || !configured.password) throw new Error("Demo credentials are unavailable. Enter your own credentials to sign in.");
        if (controller.signal.aborted || active.current !== controller) return;
        credentials = { email: configured.email, password: configured.password };
        setEmail(credentials.email);
        setPassword(credentials.password);
      }
      if (mode === 'fill') { setNotice('Configured credentials filled. Click Sign In when ready.'); return; }
      const result = await signIn("credentials", { ...credentials, redirect: false, callbackUrl });
      if (controller.signal.aborted || active.current !== controller) return;
      if (result?.error) throw new Error("Invalid email or password");
      if (result?.ok !== true) throw new Error("Sign in did not complete. Try again.");
      router.push(callbackUrl);
      router.refresh();
    } catch (failure) {
      if (!controller.signal.aborted && active.current === controller) setError(failure instanceof Error ? failure.message : "Could not reach sign-in. Try again.");
    } finally {
      if (active.current === controller) { active.current = null; setPending(null); }
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    void authenticate('manual');
  };

  return (
    <Card className="w-full max-w-md">
      <CardHeader className="text-center">
        <div className="flex justify-center mb-4">
          <div className="p-3 bg-primary rounded-full">
            <UtensilsCrossed className="h-8 w-8 text-primary-foreground" />
          </div>
        </div>
        <CardTitle className="text-2xl">Welcome Back</CardTitle>
        <CardDescription>
          Sign in to your restaurant management dashboard
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              placeholder="admin@restaurant.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              disabled={pending !== null}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="password">Password</Label>
            <Input
              id="password"
              type="password"
              placeholder="Enter your password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              disabled={pending !== null}
            />
          </div>

          {notice && <p role="status" className="text-sm text-primary">{notice}</p>}
          <Button type="button" variant="outline" className="w-full" disabled={!demoEnabled || pending !== null} onClick={() => void authenticate('fill')}>{pending === 'fill' ? 'Filling credentials…' : 'Fill credentials'}</Button>
          <button
            type="button"
            onClick={() => void authenticate('demo')}
            disabled={!demoEnabled || pending !== null}
            aria-label="Log In as Demo"
            style={{ width: '100%', marginBottom: '12px', padding: '10px 14px', borderRadius: '8px', border: '1px solid currentColor', cursor: 'pointer' }}
            className="bg-primary text-primary-foreground disabled:opacity-60"
          >
            {demoLoading ? "Loading Demo Credentials…" : "Log In as Demo"}
          </button>
          {!demoEnabled && <p role="status" className="text-sm text-muted-foreground">{demoChecked ? 'Demo credentials are unavailable on this host. Use your provisioned account.' : 'Checking demo credential configuration…'}</p>}
          <Button type="submit" className="w-full" disabled={pending !== null}>
            {loading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Signing in...
              </>
            ) : (
              "Sign In"
            )}
          </Button>
          <Link className="block text-center text-sm text-primary underline-offset-4 hover:underline" href="/reset-password">
            Reset password
          </Link>
        </form>

        <p className="mt-6 text-center text-sm text-muted-foreground">
          Accounts are provisioned by a merchant administrator.
        </p>
      </CardContent>
    </Card>
  );
}

function LoginFormFallback() {
  return (
    <Card className="w-full max-w-md">
      <CardHeader className="text-center">
        <div className="flex justify-center mb-4">
          <div className="p-3 bg-primary rounded-full">
            <UtensilsCrossed className="h-8 w-8 text-primary-foreground" />
          </div>
        </div>
        <CardTitle className="text-2xl">Welcome Back</CardTitle>
        <CardDescription>
          Sign in to your restaurant management dashboard
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex items-center justify-center py-8">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      </CardContent>
    </Card>
  );
}

export default function LoginPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-orange-50 to-red-50 p-4">
      <Suspense fallback={<LoginFormFallback />}>
        <LoginForm />
      </Suspense>
    </div>
  );
}
