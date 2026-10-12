"use client";

import { Button } from '@/components/ui/button';

export function RecordLoadNotice({ error, busy, onRetry }: { error: string; busy: boolean; onRetry: () => void }) {
  if (!error) return null;
  return <div role="alert" className="m-4 rounded border border-destructive/40 bg-destructive/5 p-4 flex items-center justify-between gap-4"><p>{error} The records below may be out of date.</p><Button type="button" variant="outline" disabled={busy} onClick={onRetry}>Retry loading records</Button></div>;
}
