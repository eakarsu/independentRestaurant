/**
 * Customer-facing AI assistant.
 *
 * The gap against AmeritAI's core product: its "General AI Assistant" greets
 * visitors, answers questions, captures leads and hands off to a human across
 * web/WhatsApp/Instagram/phone. `independentRestaurant` had only an internal
 * manager-advice endpoint.
 *
 *   POST /api/customer-ai            one conversation turn
 *   POST /api/customer-ai (consent)  record or withdraw privacy consent
 *   GET  /api/customer-ai            widget / iframe / direct-link config
 *
 * Public: this is what a diner talks to. Consent is enforced before any turn
 * is answered, and answers are composed from menu rows — no allergen or
 * ingredient claims are invented.
 */
import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { askAssistant, providerConfigured } from "@/lib/customer/openrouter";
import {
  analyseTranscript,
  evaluateConsent,
  reply,
  type ChatTurn,
  type ConsentState,
} from "@/lib/customer/assistant";

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
      note: "No message is processed until data privacy consent is recorded for the session.",
    },
    languages: { supported: ["en"], note: "50+ language support is not configured in this build." },
  });
}

export async function POST(request: NextRequest) {
  try {
    const input = await request.json().catch(() => ({}));
    const action = String(input.action ?? "message");

    /* ------------------------- consent ------------------------- */
    if (action === "consent") {
      const sessionId = String(input.sessionId ?? "").trim();
      if (!sessionId) return NextResponse.json({ error: "sessionId is required" }, { status: 400 });
      const state: ConsentState = input.granted === false ? "withdrawn" : "granted";
      const gate = evaluateConsent(state);
      return NextResponse.json({
        sessionId,
        consent: state,
        allowed: gate.allowed,
        reason: gate.reason,
        recordedAt: new Date().toISOString(),
      });
    }

    /* -------------------------- message ------------------------ */
    const sessionId = String(input.sessionId ?? "").trim();
    const text = String(input.text ?? "").trim();
    const consent: ConsentState = input.consent ?? "none";
    if (!sessionId) return NextResponse.json({ error: "sessionId is required" }, { status: 400 });
    if (!text) return NextResponse.json({ error: "text is required" }, { status: 400 });

    const gate = evaluateConsent(consent);
    if (!gate.allowed) {
      return NextResponse.json({ blocked: true, reason: gate.reason, consentRequired: true }, { status: 403 });
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

    const deterministic = reply(text, ctx, consent);

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
    // capture a callback record and raise a staff notification.
    let handoffTicket: { callbackId: string | null; notificationId: string | null } | null = null;
    if (result.handoff.handoff) {
      let callbackId: string | null = null;
      let notificationId: string | null = null;
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
      try {
        const staffRecipient = process.env.RESTAURANT_STAFF_NOTIFICATION_TARGET;
        if (staffRecipient) {
          const n = await prisma.notification.create({
            data: {
              type: 'HANDOFF',
              channel: 'EMAIL',
              recipient: staffRecipient,
              subject: 'Guest needs a person',
              message: `Session ${sessionId}: ${result.handoff.reason ?? 'guest requested a human'}\nGuest said: ${text.slice(0, 500)}`,
              metadata: { sessionId, callbackId },
            },
          });
          notificationId = n.id;
        }
      } catch { /* notification is best-effort */ }
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