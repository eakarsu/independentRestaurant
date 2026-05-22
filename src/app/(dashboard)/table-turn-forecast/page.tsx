"use client";

import { useState } from "react";

const sampleReservations = JSON.stringify(
  [
    { time: "18:00", partySize: 4, channel: "phone" },
    { time: "18:30", partySize: 2, channel: "web" },
    { time: "19:00", partySize: 6, channel: "web" },
  ],
  null,
  2,
);

export default function TableTurnForecastPage() {
  const [seats, setSeats] = useState("72");
  const [averageTurnMinutes, setAverageTurnMinutes] = useState("78");
  const [walkInDemand, setWalkInDemand] = useState("38");
  const [reservations, setReservations] = useState(sampleReservations);
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function run() {
    setLoading(true);
    setError("");
    setResult(null);
    try {
      const response = await fetch("/api/table-turn-forecast", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          seats,
          averageTurnMinutes,
          walkInDemand,
          reservations: JSON.parse(reservations),
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Forecast failed");
      setResult(data);
    } catch (err: any) {
      setError(err.message || "Forecast failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-semibold text-slate-950">Table Turn Forecast</h1>
        <p className="text-sm text-slate-600">Balance reservations, walk-ins, and holdback seats for dinner service.</p>
      </div>
      <div className="grid gap-6 lg:grid-cols-2">
        <section className="rounded-lg border bg-white p-5 shadow-sm">
          <div className="grid gap-3 sm:grid-cols-3">
            <Field label="Seats" value={seats} onChange={setSeats} />
            <Field label="Turn minutes" value={averageTurnMinutes} onChange={setAverageTurnMinutes} />
            <Field label="Walk-ins" value={walkInDemand} onChange={setWalkInDemand} />
          </div>
          <label className="mt-4 block text-sm font-medium text-slate-700">Reservations JSON</label>
          <textarea className="mt-1 h-52 w-full rounded-md border px-3 py-2 font-mono text-sm" value={reservations} onChange={(event) => setReservations(event.target.value)} />
          {error ? <div className="mt-3 text-sm text-red-600">{error}</div> : null}
          <button className="mt-4 rounded-md bg-slate-950 px-4 py-2 text-sm font-medium text-white disabled:opacity-60" onClick={run} disabled={loading}>
            {loading ? "Forecasting..." : "Forecast turns"}
          </button>
        </section>
        <section className="rounded-lg border bg-white p-5 shadow-sm">
          {result ? (
            <div className="space-y-4">
              <div className="grid grid-cols-3 gap-3">
                <Metric label="Capacity" value={result.dinnerCapacity} />
                <Metric label="Demand" value={result.demand} />
                <Metric label="Wait" value={`${result.waitMinutes}m`} />
              </div>
              <div className="rounded-md bg-slate-50 p-3 text-sm text-slate-700">Utilization {result.utilization}% with {result.holdbackSeats} holdback seats.</div>
              <ul className="list-disc pl-5 text-sm text-slate-700">
                {result.recommendations.map((line: string) => <li key={line}>{line}</li>)}
              </ul>
            </div>
          ) : (
            <p className="text-sm text-slate-600">Run a forecast to see host-stand guidance.</p>
          )}
        </section>
      </div>
    </main>
  );
}

function Field({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <label className="block text-sm font-medium text-slate-700">
      {label}
      <input className="mt-1 w-full rounded-md border px-3 py-2" value={value} onChange={(event) => onChange(event.target.value)} />
    </label>
  );
}

function Metric({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-md bg-slate-50 p-3">
      <div className="text-xs uppercase text-slate-500">{label}</div>
      <div className="text-xl font-semibold text-slate-950">{value}</div>
    </div>
  );
}
