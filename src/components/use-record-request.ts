"use client";

import { useEffect, useRef, useState } from 'react';

export function useRecordRequest() {
  const current = useRef<AbortController | null>(null);
  const mounted = useRef(true);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; current.current?.abort(); }; }, []);
  const start = () => {
    if (current.current) return null;
    const controller = new AbortController(); current.current = controller;
    setBusy(true); setNotice(''); return controller;
  };
  const finish = (controller: AbortController) => {
    if (current.current !== controller) return;
    current.current = null;
    if (mounted.current) setBusy(false);
  };
  const cancel = () => {
    if (!current.current) return;
    current.current.abort();
    if (mounted.current) setNotice('Cancellation requested. Reload saved records to confirm their current state.');
  };
  return { start, finish, cancel, busy, notice };
}
