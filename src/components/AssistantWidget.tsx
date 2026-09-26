"use client";
/**
 * On-page AI assistant widget.
 *
 * The visible half of the AmeritAI parity work: a chat bubble on every page
 * that greets the guest, answers from the customer-ai endpoint, offers guided
 * taps, captures leads and hands off to a person.
 *
 * Consent gate: nothing is sent until the guest accepts, matching the
 * "Data Privacy & Consent" skill.
 */
import { useCallback, useEffect, useRef, useState } from "react";

interface Turn {
  role: "guest" | "assistant";
  text: string;
}

interface Guided {
  intent: string;
  options: string[];
}

const CONSENT_KEY = "ir_assistant_consent";

export default function AssistantWidget({
  name = "Assistant",
  greeting = "Hi! Ask me anything about the menu.",
  position = "bottom-right",
  primaryColor = "#0f766e",
}: {
  name?: string;
  greeting?: string;
  position?: "bottom-right" | "bottom-left";
  primaryColor?: string;
}) {
  const [open, setOpen] = useState(false);
  const [consent, setConsent] = useState<"none" | "granted">("none");
  const [turns, setTurns] = useState<Turn[]>([]);
  const [guided, setGuided] = useState<Guided[]>([]);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [handoff, setHandoff] = useState<string | null>(null);
  const [aiStatus, setAiStatus] = useState<{ usedProvider: boolean; model: string | null; fallbackReason: string | null } | null>(null);
  const sessionId = useRef(`s-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);
  const bottom = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    try {
      if (localStorage.getItem(CONSENT_KEY) === "granted") setConsent("granted");
    } catch {
      /* storage unavailable; consent is asked again */
    }
  }, []);

  useEffect(() => {
    bottom.current?.scrollIntoView({ behavior: "smooth" });
  }, [turns, guided]);

  const acceptConsent = useCallback(() => {
    setConsent("granted");
    try {
      localStorage.setItem(CONSENT_KEY, "granted");
    } catch {
      /* ignore */
    }
    setTurns([{ role: "assistant", text: greeting }]);
  }, [greeting]);

  const send = useCallback(
    async (text: string) => {
      const body = text.trim();
      if (!body || busy) return;
      setDraft("");
      setTurns((t) => [...t, { role: "guest", text: body }]);
      setBusy(true);
      try {
        const res = await fetch("/api/customer-ai", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sessionId: sessionId.current, text: body, consent }),
        });
        const json = await res.json();
        if (res.status === 403) {
          setTurns((t) => [...t, { role: "assistant", text: json.reason ?? "Consent is required." }]);
          setConsent("none");
          return;
        }
        setTurns((t) => [...t, { role: "assistant", text: json.reply ?? "I'm not sure — let me get a person." }]);
        setGuided(json.guided ?? []);
        if (json.handoff?.handoff) setHandoff(json.handoff.reason ?? "Passing you to a team member.");
        if (json.ai) setAiStatus(json.ai);
        if (json.lead?.captured) {
          setTurns((t) => [...t, { role: "assistant", text: "Thanks — I've noted your details so we can get back to you." }]);
        }
      } catch {
        setTurns((t) => [...t, { role: "assistant", text: "Something went wrong reaching the assistant." }]);
      } finally {
        setBusy(false);
      }
    },
    [busy, consent],
  );

  const side = position === "bottom-left" ? { left: 20 } : { right: 20 };

  return (
    <div style={{ position: "fixed", bottom: 20, ...side, zIndex: 40, fontFamily: "system-ui, sans-serif" }}>
      {open && (
        <div
          style={{
            width: 360,
            maxWidth: "calc(100vw - 40px)",
            height: 520,
            maxHeight: "70vh",
            background: "#fff",
            borderRadius: 14,
            boxShadow: "0 12px 40px rgba(15,23,42,.18)",
            display: "flex",
            flexDirection: "column",
            overflow: "hidden",
            border: "1px solid #e2e8f0",
          }}
        >
          <div style={{ background: primaryColor, color: "#fff", padding: "14px 16px" }}>
            <strong>{name}</strong>
            <div style={{ fontSize: 12, opacity: 0.9 }}>
              {handoff
                ? "Connected to the team"
                : aiStatus
                  ? aiStatus.usedProvider
                    ? `AI: ${aiStatus.model ?? "model"}`
                    : "Answers from records (AI unavailable)"
                  : "Online — ask away"}
            </div>
          </div>

          <div style={{ flex: 1, overflowY: "auto", padding: 16, background: "#f8fafc" }}>
            {consent !== "granted" ? (
              <div style={{ fontSize: 14, lineHeight: 1.5 }}>
                <p style={{ marginTop: 0 }}>
                  Before we start: I process what you type to answer you. Your details are used only to
                  reply and to pass messages to the team.
                </p>
                <button
                  onClick={acceptConsent}
                  style={{ background: primaryColor, color: "#fff", border: 0, padding: "10px 16px", borderRadius: 8, cursor: "pointer" }}
                >
                  I agree — start
                </button>
              </div>
            ) : (
              <>
                {turns.map((t, i) => (
                  <div
                    key={i}
                    style={{
                      display: "flex",
                      justifyContent: t.role === "guest" ? "flex-end" : "flex-start",
                      marginBottom: 10,
                    }}
                  >
                    <div
                      style={{
                        maxWidth: "85%",
                        padding: "9px 12px",
                        borderRadius: 12,
                        fontSize: 14,
                        lineHeight: 1.45,
                        background: t.role === "guest" ? primaryColor : "#fff",
                        color: t.role === "guest" ? "#fff" : "#0f172a",
                        border: t.role === "guest" ? "none" : "1px solid #e2e8f0",
                        whiteSpace: "pre-wrap",
                      }}
                    >
                      {t.text}
                    </div>
                  </div>
                ))}
                {guided.map((g, i) => (
                  <div key={i} style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 8 }}>
                    {g.options.map((o) => (
                      <button
                        key={o}
                        onClick={() => void send(o)}
                        style={{
                          fontSize: 12,
                          padding: "6px 10px",
                          borderRadius: 999,
                          border: `1px solid ${primaryColor}`,
                          color: primaryColor,
                          background: "#fff",
                          cursor: "pointer",
                        }}
                      >
                        {o}
                      </button>
                    ))}
                  </div>
                ))}
                <div ref={bottom} />
              </>
            )}
          </div>

          {consent === "granted" && (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void send(draft);
              }}
              style={{ display: "flex", gap: 8, padding: 12, borderTop: "1px solid #e2e8f0", background: "#fff" }}
            >
              <input
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                placeholder="Ask about the menu…"
                style={{ flex: 1, padding: "10px 12px", borderRadius: 8, border: "1px solid #cbd5e1", fontSize: 14 }}
              />
              <button
                type="submit"
                disabled={busy}
                style={{ background: primaryColor, color: "#fff", border: 0, borderRadius: 8, padding: "10px 14px", cursor: busy ? "wait" : "pointer" }}
              >
                {busy ? "…" : "Send"}
              </button>
            </form>
          )}
        </div>
      )}

      <button
        onClick={() => setOpen((o) => !o)}
        aria-label={open ? "Close assistant" : "Open assistant"}
        style={{
          marginTop: 12,
          marginLeft: "auto",
          display: "block",
          width: 58,
          height: 58,
          borderRadius: "50%",
          background: primaryColor,
          color: "#fff",
          border: "none",
          boxShadow: "0 8px 24px rgba(15,23,42,.22)",
          cursor: "pointer",
          fontSize: 22,
        }}
      >
        {open ? "×" : "💬"}
      </button>
    </div>
  );
}