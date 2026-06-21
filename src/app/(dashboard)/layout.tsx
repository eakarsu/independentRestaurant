"use client";

import { Sidebar } from "@/components/layout/sidebar";
import { AssistantWidget } from "@/components/ai/assistant-widget";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex h-screen">
      <Sidebar />
      <main className="flex-1 overflow-auto">{children}</main>
      <AssistantWidget />
    </div>
  );
}
