"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import AIResponseReport from "@/components/AIResponseReport";

interface AiStatus { usedProvider: boolean; model: string | null; fallbackReason: string | null }
interface Turn { role: "guest" | "assistant"; text: string; ai?: AiStatus }
interface Guided { intent: string; options: string[] }

const CONSENT_KEY = "ir_assistant_consent";
const examples = [
  { label: "Demo AI · Menu options", question: "Which menu items are currently available? Use the restaurant's saved menu records and prices, identify missing details, and explain what the kitchen must confirm before ordering." },
  { label: "Demo AI · Visit information", question: "What are the restaurant's recorded opening hours, address and contact details? State any missing information and explain how I can check it with the restaurant." },
  { label: "Demo AI · Table request", question: "How can I request a table or private event? Explain the restaurant's approved process and the information staff need. Do not create a booking or assume contact details; staff must confirm availability." },
];

async function responseBody(response: Response) {
  const body = await response.json().catch(() => null);
  if (!body || typeof body !== "object" || Array.isArray(body)) throw new Error("The assistant returned an invalid response. Try again.");
  return body;
}

export default function AssistantWidget({ name = "Assistant", greeting = "Hi! Ask me anything about the menu.", position = "bottom-right", primaryColor = "#0f766e" }: { name?: string; greeting?: string; position?: "bottom-right" | "bottom-left"; primaryColor?: string }) {
  const [open, setOpen] = useState(false);
  const [consent, setConsent] = useState<"none" | "granted">("none");
  const [turns, setTurns] = useState<Turn[]>([]);
  const [guided, setGuided] = useState<Guided[]>([]);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [handoff, setHandoff] = useState<string | null>(null);
  const [aiStatus, setAiStatus] = useState<AiStatus | null>(null);
  const request = useRef<AbortController | null>(null);
  const sessionId = useRef(`s-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);
  const bottom = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    try { if (localStorage.getItem(CONSENT_KEY) === "granted") setConsent("granted"); }
    catch { /* The native server still verifies signed consent on each message. */ }
    return () => { request.current?.abort(); request.current = null; };
  }, []);
  useEffect(() => { bottom.current?.scrollIntoView({ behavior: "smooth" }); }, [turns, guided]);

  const cancel = useCallback(() => {
    const active = request.current;
    if (!active) return;
    request.current = null;
    active.abort();
    setBusy(false);
    setNotice("Request cancelled. Your question is preserved.");
  }, []);

  const acceptConsent = useCallback(async () => {
    if (request.current) return;
    const controller = new AbortController();
    request.current = controller;
    setBusy(true); setError(""); setNotice("");
    try {
      const response = await fetch("/api/customer-ai", { method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "consent", sessionId: sessionId.current, granted: true }), signal: controller.signal });
      const body = await responseBody(response);
      if (!response.ok || body.consent !== "granted" || body.allowed !== true) throw new Error(typeof body.error === "string" ? body.error : "Your consent could not be recorded. Try again.");
      if (request.current !== controller || controller.signal.aborted) return;
      try { localStorage.setItem(CONSENT_KEY, "granted"); } catch { /* Storage is optional; the signed native cookie remains authoritative. */ }
      setConsent("granted");
      setTurns([{ role: "assistant", text: greeting }]);
    } catch (failure) {
      if (request.current === controller && !controller.signal.aborted) setError(failure instanceof Error ? failure.message : "Could not record consent. Try again.");
    } finally {
      if (request.current === controller) { request.current = null; setBusy(false); }
    }
  }, [greeting]);

  const send = useCallback(async (text: string) => {
    const question = text.trim();
    if (!question || question.length > 2000 || consent !== "granted" || request.current) return;
    const controller = new AbortController();
    request.current = controller;
    setBusy(true); setError(""); setNotice("");
    setTurns(previous => [...previous, { role: "guest", text: question }]);
    try {
      const response = await fetch("/api/customer-ai", { method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ sessionId: sessionId.current, text: question }), signal: controller.signal });
      const body = await responseBody(response);
      if (request.current !== controller || controller.signal.aborted) return;
      if (response.status === 403 && body.consentRequired === true) {
        setConsent("none");
        try { localStorage.removeItem(CONSENT_KEY); } catch { /* Native consent remains required. */ }
        throw new Error(typeof body.reason === "string" ? body.reason : "Consent is required. Review the consent notice to continue.");
      }
      if (!response.ok) throw new Error(typeof body.error === "string" ? body.error : "The assistant request did not complete. Try again.");
      if (typeof body.reply !== "string" || !body.reply.trim() || typeof body.ai?.usedProvider !== "boolean") throw new Error("The assistant returned an invalid response. No AI answer is available.");
      const status: AiStatus = { usedProvider: body.ai.usedProvider, model: typeof body.ai.model === "string" ? body.ai.model : null, fallbackReason: typeof body.ai.fallbackReason === "string" ? body.ai.fallbackReason : null };
      setTurns(previous => [...previous, { role: "assistant", text: body.reply, ai: status }]);
      setDraft("");
      setAiStatus(status);
      setGuided(Array.isArray(body.guided) ? body.guided.filter((item: Guided) => item && typeof item.intent === "string" && Array.isArray(item.options) && item.options.every(option => typeof option === "string" && option.trim() && option.length <= 2000)) : []);
      if (body.handoff?.handoff === true) setHandoff(typeof body.handoff.reason === "string" ? body.handoff.reason : "A team follow-up was requested.");
      if (body.lead?.captured === true) setTurns(previous => [...previous, { role: "assistant", text: "Your supplied contact details were recorded for the team to follow up." }]);
    } catch (failure) {
      if (request.current === controller && !controller.signal.aborted) setError(failure instanceof Error ? failure.message : "Could not reach the assistant. Try again.");
    } finally {
      if (request.current === controller) { request.current = null; setBusy(false); }
    }
  }, [consent]);

  function fill(question: string) { if (request.current) return; setDraft(question); setError(""); setNotice("Question filled. Review it, then Generate with OpenRouter."); }
  const side = position === "bottom-left" ? { left: 20 } : { right: 20 };
  const choiceStyle = { fontSize: 12, padding: "6px 10px", borderRadius: 8, border: `1px solid ${primaryColor}`, color: primaryColor, background: "#fff", cursor: busy ? "wait" : "pointer" };

  return <div style={{ position: "fixed", bottom: 20, ...side, zIndex: 40, fontFamily: "system-ui, sans-serif" }}>
    {open && <section role="dialog" aria-label="Restaurant assistant" style={{ width: 400, maxWidth: "calc(100vw - 40px)", height: 640, maxHeight: "80vh", background: "#fff", borderRadius: 14, boxShadow: "0 12px 40px rgba(15,23,42,.18)", display: "flex", flexDirection: "column", overflow: "hidden", border: "1px solid #e2e8f0" }}>
      <header style={{ background: primaryColor, color: "#fff", padding: "14px 16px" }}><strong>{name}</strong><div style={{ fontSize: 12, opacity: 0.9 }}>{handoff ? "Handoff requested" : aiStatus ? aiStatus.usedProvider ? `OpenRouter · ${aiStatus.model ?? "model"}` : "Answer from saved records · AI unavailable" : "Menu, hours and table enquiries"}</div></header>
      <div style={{ flex: 1, overflowY: "auto", padding: 16, background: "#f8fafc" }}>
        {consent !== "granted" ? <div style={{ fontSize: 14, lineHeight: 1.5 }}><p style={{ marginTop: 0 }}>Before we start: I process what you type to answer you. Your details are used only to reply and to pass messages to the team.</p><button disabled={busy} onClick={() => void acceptConsent()} style={{ background: primaryColor, color: "#fff", border: 0, padding: "10px 16px", borderRadius: 8, cursor: busy ? "wait" : "pointer" }}>{busy ? "Recording consent…" : "I agree — start"}</button></div> : <>
          {turns.map((turn, index) => <div key={index} style={{ display: "flex", justifyContent: turn.role === "guest" ? "flex-end" : "flex-start", marginBottom: 10 }}><div style={{ maxWidth: turn.ai ? "100%" : "85%", padding: turn.ai ? 0 : "9px 12px", borderRadius: 12, fontSize: 14, lineHeight: 1.45, background: turn.role === "guest" ? primaryColor : "#fff", color: turn.role === "guest" ? "#fff" : "#0f172a", border: turn.role === "guest" || turn.ai ? "none" : "1px solid #e2e8f0", whiteSpace: "pre-wrap" }}>{turn.ai ? <><AIResponseReport value={{ content: turn.text, model: turn.ai.usedProvider ? turn.ai.model : null }} title={turn.ai.usedProvider ? "OpenRouter answer" : "Answer from saved restaurant records"} kind={turn.ai.usedProvider ? "ai" : "workflow"}/>{!turn.ai.usedProvider && <p style={{ fontSize: 12 }}>No AI answer was generated. {turn.ai.fallbackReason ?? "The native service returned its saved-record answer."}</p>}</> : turn.text}</div></div>)}
          {guided.map((group, index) => <div key={index} style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 8 }}>{group.options.map(option => <button type="button" key={option} disabled={busy} onClick={() => fill(option)} style={choiceStyle}>{option}</button>)}</div>)}
          <div ref={bottom}/>
        </>}
        {error && <p role="alert" style={{ color: "#b91c1c", fontSize: 13 }}>{error}</p>}{notice && <p role="status" style={{ color: "#334155", fontSize: 13 }}>{notice}</p>}
      </div>
      {consent === "granted" && <form aria-label="Restaurant question" aria-busy={busy} onSubmit={event => { event.preventDefault(); void send(draft); }} style={{ display: "grid", gap: 8, padding: 12, borderTop: "1px solid #e2e8f0", background: "#fff" }}>
        <p style={{ margin: 0, fontSize: 12, color: "#475569" }}>Each Demo AI choice fills the entire question field. Consent and personal contact details remain manual.</p>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>{examples.map(example => <button type="button" key={example.label} disabled={busy} onClick={() => fill(example.question)} style={choiceStyle}>{example.label}</button>)}</div>
        <label style={{ fontSize: 13 }}>Your question<input name="text" data-ai-field="text" required maxLength={2000} disabled={busy} value={draft} onChange={event => setDraft(event.target.value)} placeholder="Ask about the menu…" style={{ width: "100%", marginTop: 4, padding: "10px 12px", borderRadius: 8, border: "1px solid #cbd5e1", fontSize: 14 }}/></label>
        <div style={{ display: "flex", gap: 8 }}><button type="submit" disabled={busy || !draft.trim()} style={{ background: primaryColor, color: "#fff", border: 0, borderRadius: 8, padding: "10px 14px", cursor: busy ? "wait" : "pointer" }}>{busy ? "Generating…" : "Generate with OpenRouter"}</button>{busy && <button type="button" onClick={cancel} style={choiceStyle}>Cancel request</button>}</div>
      </form>}
    </section>}
    <button type="button" onClick={() => { if (open) cancel(); setOpen(previous => !previous); }} aria-label={open ? "Close assistant" : "Open assistant"} style={{ marginTop: 12, marginLeft: "auto", display: "block", width: 58, height: 58, borderRadius: "50%", background: primaryColor, color: "#fff", border: "none", boxShadow: "0 8px 24px rgba(15,23,42,.22)", cursor: "pointer", fontSize: 22 }}>{open ? "×" : "💬"}</button>
  </div>;
}
