/**
 * Customer-facing AI assistant.
 *
 *   POST /api/customer-ai            one conversation turn
 *   POST /api/customer-ai (consent)  record or withdraw privacy consent
 *   GET  /api/customer-ai            widget / iframe / direct-link config
 *
 * Public: this is what a diner talks to. Consent is recorded server-side in a
 * signed, HTTP-only cookie and verified before any turn is answered; answers
 * are composed from menu rows — no allergen or ingredient claims are invented.
 */
import { NextRequest, NextResponse } from "next/server";
import { createHmac, timingSafeEqual } from "node:crypto";
import prisma from "@/lib/prisma";
import { getClientIp } from "@/lib/api-helpers";
import { customerAiDailyLimiter, customerAiLimiter } from "@/lib/rate-limit";
import { queueStaffAlert } from "@/lib/operations/notifications";
import { askAssistant, providerConfigured } from "@/lib/customer/openrouter";
import {
  analyseTranscript,
  evaluateConsent,
  reply,
  type ChatTurn,
  type ConsentState,
} from "@/lib/customer/assistant";

const CONSENT_COOKIE = "ir_assistant_consent";
const CONSENT_TTL_MS = 30 * 24 * 60 * 60 * 1000;

function consentSecret(): string | null {
  return process.env.NEXTAUTH_SECRET || null;
}

function signConsent(sessionId: string, expiresAt: number, secret: string): string {
  return createHmac("sha256", secret)
    .update(`assistant-consent:${sessionId}:${expiresAt}`)
    .digest("hex");
}

function verifyConsent(sessionId: string, raw: string | undefined): boolean {
  const secret = consentSecret();
  if (!secret || !raw) return false;
  const [expiresRaw, signature] = raw.split(".");
  const expiresAt = Number(expiresRaw);
  if (!Number.isSafeInteger(expiresAt) || expiresAt < Date.now() || !signature) return false;
  const expected = signConsent(sessionId, expiresAt, secret);
  const expectedBuffer = Buffer.from(expected);
  const suppliedBuffer = Buffer.from(signature);
  return (
    expectedBuffer.length === suppliedBuffer.length &&
    timingSafeEqual(expectedBuffer, suppliedBuffer)
  );
}

function consentCookie(sessionId: string, secret: string): string {
  const expiresAt = Date.now() + CONSENT_TTL_MS;
  const secure = process.env.NEXTAUTH_URL?.startsWith("https://") ? "; Secure" : "";
  return `${CONSENT_COOKIE}=${expiresAt}.${signConsent(sessionId, expiresAt, secret)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${Math.floor(CONSENT_TTL_MS / 1000)}${secure}`;
}

export async function GET() {
  return NextResponse.json({
    embed: {
      webWidget: { enabled: true, mount: "#independent-restaurant-assistant" },
      iframe: { enabled: true, src: "/assistant" },
      directLink: { enabled: true, href: "/assistant" },
    },
    channels: {
      web: true,
      whatsapp: false,
      instagram: false,
      phone: false,
      note: "WhatsApp/Instagram/phone channels require provider credentials and are not configured here.",
    },
    privacy: {
      consentRequired: true,
      note: "Consent is recorded in a signed, HTTP-only session cookie and verified server-side before any message is processed.",
    },
    languages: { supported: ["en"], note: "50+ language support is not configured in this build." },
  });
}

export async function POST(request: NextRequest) {
  try {
    const ip = getClientIp(request);
    if (!customerAiLimiter(ip).success || !customerAiDailyLimiter(ip).success) {
      return NextResponse.json(
        { error: "Too many assistant requests. Please try again shortly." },
        { status: 429 },
      );
    }

    const input = await request.json().catch(() => ({}));
    const action = String(input.action ?? "message");

    /* ------------------------- consent ------------------------- */
    if (action === "consent") {
      const sessionId = String(input.sessionId ?? "").trim();
      if (!/^[\w-]{8,100}$/.test(sessionId))
        return NextResponse.json({ error: "A valid sessionId is required" }, { status: 400 });
      const secret = consentSecret();
      if (!secret)
        return NextResponse.json(
          { error: "Assistant consent is not configured on this server" },
          { status: 503 },
        );
      const recordedAt = new Date().toISOString();
      if (input.granted === false) {
        const gate = evaluateConsent("withdrawn");
        const withdrawn = NextResponse.json({
          sessionId,
          consent: "withdrawn",
          allowed: gate.allowed,
          reason: gate.reason,
          recordedAt,
        });
        withdrawn.headers.append(
          "Set-Cookie",
          `${CONSENT_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`,
        );
        return withdrawn;
      }
      const gate = evaluateConsent("granted");
      const granted = NextResponse.json({
        sessionId,
        consent: "granted",
        allowed: gate.allowed,
        reason: gate.reason,
        recordedAt,
      });
      granted.headers.append("Set-Cookie", consentCookie(sessionId, secret));
      return granted;
    }

    /* -------------------------- message ------------------------ */
    const sessionId = String(input.sessionId ?? "").trim();
    const text = String(input.text ?? "").trim();
    if (!/^[\w-]{8,100}$/.test(sessionId))
      return NextResponse.json({ error: "A valid sessionId is required" }, { status: 400 });
    if (!text) return NextResponse.json({ error: "text is required" }, { status: 400 });
    if (text.length > 2000)
      return NextResponse.json({ error: "Message is too long" }, { status: 400 });

    if (!verifyConsent(sessionId, request.cookies.get(CONSENT_COOKIE)?.value)) {
      const gate = evaluateConsent("none");
      return NextResponse.json(
        {
          blocked: true,
          reason: gate.reason,
          consentRequired: true,
        },
        { status: 403 },
      );
    }

    // Menu facts come from rows; nothing is invented.
    // AI Training Resources: feed the restaurant's own approved knowledge
    // (FAQ / uploaded documents) into the conversation. The assistant was
    // previously trained on menu rows only.
    const knowledge = await prisma.restaurantKnowledge.findMany({
      where: { active: true, approvedById: { not: null } },
      select: { title: true, content: true, sourceUrl: true },
      take: 25,
      orderBy: { updatedAt: 'desc' },
    });

    const items = await prisma.menuItem.findMany({
      where: { isAvailable: true, is86d: false },
      select: { id: true, name: true, description: true, price: true, allergens: true },
      take: 200,
    });

    const ctx = {
      restaurantName: process.env.RESTAURANT_NAME ?? "our restaurant",
      hours: process.env.RESTAURANT_HOURS ?? undefined,
      address: process.env.RESTAURANT_ADDRESS ?? undefined,
      phone: process.env.RESTAURANT_PHONE ?? undefined,
      menuItems: items.map((i: any) => ({
        id: i.id,
        name: i.name,
        description: i.description ?? null,
        price: i.price != null ? Number(i.price) : null,
        category: null,
      })),
    };

    const deterministic = reply(text, ctx, "granted" as ConsentState);

    // The assistant must actually reach the model. Only fall back to the
    // deterministic answer when no provider is configured or the call fails,
    // and say which path was used.
    const sources = items.slice(0, 40).map((i: any) => ({
      id: String(i.id),
      title: i.name,
      data: {
        name: i.name,
        description: i.description ?? null,
        price: i.price != null ? Number(i.price) : null,
        allergenCodes: i.allergens ?? [],
      },
    }));
    const ai = await askAssistant({
      knowledge: knowledge.map((k) => ({ title: k.title, content: k.content, sourceUrl: k.sourceUrl })),
      question: text,
      facts: { hours: ctx.hours, address: ctx.address, phone: ctx.phone, restaurant: ctx.restaurantName },
      sources,
    });
    const result = ai.usedProvider
      ? { ...deterministic, answer: ai.text }
      : deterministic;

    // A lead is only recorded when the customer actually typed contact details.
    let leadRecorded = false;
    const lead = result.lead;
    if (lead.email || lead.phone) {
      try {
        await prisma.customerLead.create({
          data: {
            sessionId,
            name: lead.name ?? null,
            email: lead.email ?? null,
            phone: lead.phone ?? null,
            partySize: lead.partySize ?? null,
            preferredAt: lead.preferredAt ?? null,
            note: text.slice(0, 500),
            source: "assistant",
          },
        });
        leadRecorded = true;
      } catch {
        leadRecorded = false;
      }
    }

    const turns: ChatTurn[] = [
      { role: "customer", text, at: new Date().toISOString() },
      { role: "assistant", text: result.answer, at: new Date().toISOString() },
    ];
    const analysis = analyseTranscript(turns);

    // Human handoff must escalate the conversation, not just flag it:
    // capture a callback record and raise a queued staff alert.
    let handoffTicket: { callbackId: string | null; notificationId: string | null } | null = null;
    if (result.handoff.handoff) {
      let callbackId: string | null = null;
      try {
        const handoffLead = await prisma.customerLead.create({
          data: {
            sessionId,
            name: result.lead.name ?? null,
            email: result.lead.email ?? null,
            phone: result.lead.phone ?? null,
            note: `HANDOFF: ${result.handoff.reason ?? 'guest asked for a person'} | guest said: ${text.slice(0, 300)}`,
            source: 'handoff',
          },
        });
        callbackId = handoffLead.id;
      } catch { /* lead capture is best-effort */ }
      let notificationId: string | null = null;
      try {
        const alert = await queueStaffAlert({
          subject: 'Guest needs a person',
          message: `Session ${sessionId}: ${result.handoff.reason ?? 'guest requested a human'}\nGuest said: ${text.slice(0, 500)}`,
          metadata: { sessionId, callbackId },
        });
        notificationId = alert?.id ?? null;
      } catch { /* alert is best-effort */ }
      handoffTicket = { callbackId, notificationId };
    }

    return NextResponse.json({
      sessionId,
      reply: result.answer,
      guided: result.guided,
      menuMatches: result.menuMatches,
      handoff: { ...result.handoff, ticket: handoffTicket },
      lead: { captured: leadRecorded, fields: lead },
      ai: {
        usedProvider: ai.usedProvider,
        model: ai.model,
        providerRef: ai.providerRef,
        providerStatus: providerConfigured().detail,
        fallbackReason: ai.usedProvider ? null : ai.error,
      },
      analysis,
      facts: { hours: ctx.hours ?? null, address: ctx.address ?? null, phone: ctx.phone ?? null },
      assumptions: [
        "Menu answers come from recorded menu rows; nothing is invented.",
        "Allergen questions are always redirected to a team member.",
        "Sentiment and topics are deterministic lexicon matching over this turn, not a model opinion.",
        "A lead is recorded only when contact details were actually typed.",
      ],
    });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Assistant failed" }, { status: 500 });
  }
}
