"use client";

// The AI Suite now lives in the unified /ai hub. This legacy route simply
// renders the same panel so old links keep working.
import { AISuitePanel } from "@/components/ai/ai-suite-panel";

export default function AISuitePage() {
  return (
    <div className="p-6">
      <AISuitePanel />
    </div>
  );
}
