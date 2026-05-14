// // === Batch 10 Gaps & Frontend Mounts ===
// Batch 10 page: "Staff scheduling with mood / fatigue tracking" (cfs) — independentRestaurant
'use client';
import { useEffect, useState } from 'react';

const SLUG = "staff-scheduling-with-mood-fatigue-tracking";
const LABEL = "Staff scheduling with mood / fatigue tracking";
const SECTION = "cfs";
const API_PATH = "/api/cf-staff-scheduling-with-mood-fatigue-tracking";

export default function StaffSchedulingWithMoodFatigueTrackingPage() {
  const [prompt, setPrompt] = useState('');
  const [result, setResult] = useState<any>(null);
  const [history, setHistory] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function loadHistory() {
    try {
      const resp = await fetch(API_PATH + '?history=1');
      if (!resp.ok) return;
      const json = await resp.json();
      setHistory(json.items || []);
    } catch { /* ignore */ }
  }

  useEffect(() => { loadHistory(); }, []);

  async function run(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true); setError(''); setResult(null);
    try {
      const resp = await fetch(API_PATH, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt })
      });
      if (!resp.ok) setError('Request failed: ' + resp.status);
      else { setResult(await resp.json()); loadHistory(); }
    } catch (err) { setError(String(err)); } finally { setLoading(false); }
  }

  return (
    <div style={{ padding: 24, maxWidth: 880, margin: '0 auto', fontFamily: 'system-ui, sans-serif' }}>
      <h1 style={{ fontSize: 24, fontWeight: 700, marginBottom: 4 }}>{LABEL}</h1>
      <div style={{ fontSize: 13, color: '#64748b', marginBottom: 16 }}>{SECTION} · slug: {SLUG}</div>
      <form onSubmit={run} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <textarea
          value={prompt}
          onChange={e => setPrompt(e.target.value)}
          placeholder={'Describe what you want: ' + LABEL}
          rows={5}
          style={{ width: '100%', padding: 12, border: '1px solid #cbd5e1', borderRadius: 8, fontSize: 14 }}
        />
        <button
          type="submit"
          disabled={loading}
          style={{ padding: '10px 18px', background: '#2563eb', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer', alignSelf: 'flex-start' }}
        >
          {loading ? 'Running…' : 'Run'}
        </button>
      </form>
      {error && <div style={{ marginTop: 12, color: '#b91c1c' }}>{error}</div>}
      {result && (
        <pre style={{ marginTop: 18, background: '#0f172a', color: '#e2e8f0', padding: 14, borderRadius: 8, overflowX: 'auto', fontSize: 12 }}>
{JSON.stringify(result, null, 2)}
        </pre>
      )}
      <h2 style={{ marginTop: 28, fontSize: 16, fontWeight: 600 }}>Recent runs</h2>
      <ul style={{ marginTop: 10, paddingLeft: 18 }}>
        {history.length === 0 && <li style={{ color: '#94a3b8' }}>No history yet</li>}
        {history.map((item: any) => (
          <li key={item.id} style={{ marginBottom: 8 }}>
            <span style={{ color: '#475569' }}>{item.createdAt}</span> · {(typeof item.payload === 'string' ? item.payload : JSON.stringify(item.payload)).slice(0, 80)}
          </li>
        ))}
      </ul>
    </div>
  );
}
