"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Bot, Send, X, Loader2, Check } from "lucide-react";
import { cn } from "@/lib/utils";

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

interface PendingAction {
  name: string;
  arguments: Record<string, unknown>;
  summary: string;
}

const GREETING: ChatMessage = {
  role: "assistant",
  content:
    "Hi! I'm your restaurant assistant. I can check the menu, find table availability, book a reservation, or place an order. What can I do for you?",
};

export function AssistantWidget() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([GREETING]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [pending, setPending] = useState<PendingAction | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, loading, pending]);

  async function send(text: string) {
    const trimmed = text.trim();
    if (!trimmed || loading) return;
    const next = [...messages, { role: "user" as const, content: trimmed }];
    setMessages(next);
    setInput("");
    setPending(null);
    await callAssistant({ messages: next.slice(1) }); // drop client-only greeting
  }

  async function confirmPending() {
    if (!pending || loading) return;
    const action = pending;
    setPending(null);
    await callAssistant({
      messages: messages.slice(1),
      confirm: { name: action.name, arguments: action.arguments },
    });
  }

  function cancelPending() {
    setPending(null);
    setMessages((m) => [
      ...m,
      { role: "assistant", content: "No problem — I've cancelled that. Anything else?" },
    ]);
  }

  async function callAssistant(payload: Record<string, unknown>) {
    setLoading(true);
    try {
      const res = await fetch("/api/assistant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) {
        setMessages((m) => [
          ...m,
          { role: "assistant", content: data?.error || "Something went wrong. Please try again." },
        ]);
        return;
      }
      if (data.message) {
        setMessages((m) => [...m, { role: "assistant", content: data.message }]);
      }
      if (data.pendingAction) setPending(data.pendingAction);
    } catch {
      setMessages((m) => [
        ...m,
        { role: "assistant", content: "I couldn't reach the server. Please try again." },
      ]);
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      {/* Launcher */}
      {!open && (
        <button
          onClick={() => setOpen(true)}
          aria-label="Open assistant"
          className="fixed bottom-6 right-6 z-50 flex h-14 w-14 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg transition hover:scale-105"
        >
          <Bot className="h-6 w-6" />
        </button>
      )}

      {/* Panel */}
      {open && (
        <div className="fixed bottom-6 right-6 z-50 flex h-[560px] w-[380px] max-w-[calc(100vw-2rem)] flex-col overflow-hidden rounded-xl border bg-background shadow-2xl">
          <div className="flex items-center justify-between border-b bg-primary px-4 py-3 text-primary-foreground">
            <div className="flex items-center gap-2">
              <Bot className="h-5 w-5" />
              <span className="font-semibold">Restaurant Assistant</span>
            </div>
            <button onClick={() => setOpen(false)} aria-label="Close assistant">
              <X className="h-5 w-5" />
            </button>
          </div>

          <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto p-4">
            {messages.map((m, i) => (
              <div
                key={i}
                className={cn("flex", m.role === "user" ? "justify-end" : "justify-start")}
              >
                <div
                  className={cn(
                    "max-w-[85%] whitespace-pre-wrap rounded-lg px-3 py-2 text-sm",
                    m.role === "user"
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted text-foreground",
                  )}
                >
                  {m.content}
                </div>
              </div>
            ))}

            {pending && (
              <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm">
                <p className="mb-1 font-medium text-amber-900">Confirm action</p>
                <p className="mb-3 text-amber-800">{pending.summary}</p>
                <div className="flex gap-2">
                  <Button size="sm" onClick={confirmPending} disabled={loading}>
                    <Check className="mr-1 h-4 w-4" /> Confirm
                  </Button>
                  <Button size="sm" variant="outline" onClick={cancelPending} disabled={loading}>
                    Cancel
                  </Button>
                </div>
              </div>
            )}

            {loading && (
              <div className="flex justify-start">
                <div className="flex items-center gap-2 rounded-lg bg-muted px-3 py-2 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" /> Thinking…
                </div>
              </div>
            )}
          </div>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              void send(input);
            }}
            className="flex items-center gap-2 border-t p-3"
          >
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ask me anything…"
              disabled={loading}
              className="flex-1 rounded-md border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/40"
            />
            <Button type="submit" size="icon" disabled={loading || !input.trim()}>
              <Send className="h-4 w-4" />
            </Button>
          </form>
        </div>
      )}
    </>
  );
}
