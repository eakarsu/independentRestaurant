/**
 * NEW FEATURE 5 — WhatsApp / SMS reservation concierge.
 *
 * Inbound webhook (Twilio-shaped: From, To, Body) — the LLM extracts
 * reservation intent (party size, requested time, name) and either:
 *   1. creates a tentative Reservation row, OR
 *   2. asks the customer a clarifying question.
 *
 * Returns Twilio-compatible TwiML so it can be wired directly to a Twilio
 * messaging webhook. All inbound + outbound messages are persisted to
 * ConciergeMessage.
 */
import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import {
  callOpenRouter,
  parseAIJson,
} from "@/lib/ai-helpers";

const OPENROUTER_MODEL =
  process.env.OPENROUTER_MODEL || "anthropic/claude-3-5-sonnet-20241022";

function twiml(reply: string) {
  const safe = reply.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  return new NextResponse(
    `<?xml version="1.0" encoding="UTF-8"?><Response><Message>${safe}</Message></Response>`,
    { status: 200, headers: { "Content-Type": "text/xml" } },
  );
}

export async function POST(request: NextRequest) {
  // Accept either form-urlencoded (Twilio default) or JSON (for testing)
  let from = "";
  let to = "";
  let body = "";
  let channel = "sms";

  const ct = request.headers.get("content-type") || "";
  if (ct.includes("application/x-www-form-urlencoded")) {
    const text = await request.text();
    const params = new URLSearchParams(text);
    from = params.get("From") || "";
    to = params.get("To") || "";
    body = params.get("Body") || "";
    if (from.startsWith("whatsapp:")) channel = "whatsapp";
  } else {
    const json = await request.json().catch(() => ({}));
    from = json.from || json.From || "";
    to = json.to || json.To || "";
    body = json.body || json.Body || "";
    channel = json.channel || channel;
  }

  if (!from || !body) {
    return NextResponse.json({ error: "Missing From/Body" }, { status: 400 });
  }

  // Persist inbound
  const inbound = await prisma.conciergeMessage.create({
    data: {
      channel,
      direction: "inbound",
      fromNumber: from,
      toNumber: to,
      body,
      status: "received",
    },
  });

  // Available tables snapshot (next 24h)
  const tables = await prisma.table.findMany({ where: { status: { not: "OUT_OF_SERVICE" } } });
  const totalCapacity = tables.reduce((s, t) => s + t.capacity, 0);

  // Recent reservations to help the LLM understand availability
  const upcomingReservations = await prisma.reservation.count({
    where: {
      date: { gte: new Date(), lt: new Date(Date.now() + 48 * 60 * 60 * 1000) },
      status: { in: ["CONFIRMED", "PENDING", "SEATED"] },
    },
  });

  const systemPrompt = `You are a restaurant reservation concierge over SMS/WhatsApp.
Total dining capacity: ${totalCapacity} seats. Upcoming bookings (48h): ${upcomingReservations}.
Parse the customer's message and reply with STRICT JSON of shape:
{"intent":"reservation"|"info"|"unknown","reservation":{"name":"","partySize":number,"isoDateTime":"YYYY-MM-DDTHH:mm","specialOccasion":""},"reply":"...","needsClarification":bool}
Rules:
- If intent != "reservation" or fields are missing, set needsClarification=true and put your follow-up question in "reply".
- Use a friendly conversational tone in "reply". Reply must be ≤ 240 chars.
- Date defaults: if the customer says "tonight" use today's date 19:00; "tomorrow" → tomorrow 19:00.`;

  let parsed: any = {};
  let raw = "";
  let errorMsg: string | undefined;
  const t0 = Date.now();

  try {
    raw = await callOpenRouter(systemPrompt, body, {
      jsonMode: true,
      maxTokens: 600,
      temperature: 0.3,
    });
    parsed = parseAIJson(raw);
  } catch (err: any) {
    errorMsg = err?.message || String(err);
  }

  let reservationId: string | undefined;
  let reply =
    parsed.reply ||
    "Thanks for messaging! How many guests, and what date and time would you like to reserve?";

  // If LLM gave us a complete booking, write it.
  if (
    !errorMsg &&
    parsed.intent === "reservation" &&
    !parsed.needsClarification &&
    parsed.reservation?.partySize &&
    parsed.reservation?.isoDateTime
  ) {
    try {
      const dt = new Date(parsed.reservation.isoDateTime);
      const r = await prisma.reservation.create({
        data: {
          customerName: parsed.reservation.name || "Guest",
          customerPhone: from.replace(/^whatsapp:/, ""),
          partySize: Number(parsed.reservation.partySize),
          date: dt,
          time: dt,
          status: "PENDING",
          source: channel === "whatsapp" ? "whatsapp" : "sms",
          specialOccasion: parsed.reservation.specialOccasion || null,
        },
      });
      reservationId = r.id;
      reply = `Got it ${parsed.reservation.name || ""}! Holding a table for ${parsed.reservation.partySize} on ${dt.toLocaleString()}. Reply YES to confirm.`.trim();
    } catch (e: any) {
      reply = "Sorry, I couldn't save that reservation just now. Could you call us instead?";
    }
  }

  // Persist outbound
  await prisma.conciergeMessage.create({
    data: {
      channel,
      direction: "outbound",
      fromNumber: to,
      toNumber: from,
      body: reply,
      intent: parsed.intent || null,
      parsed: parsed as any,
      reservationId,
      status: "replied",
    },
  });

  await prisma.conciergeMessage.update({
    where: { id: inbound.id },
    data: {
      intent: parsed.intent || null,
      parsed: parsed as any,
      reservationId,
      status: errorMsg ? "escalated" : "replied",
    },
  });

  await prisma.aiResult.create({
    data: {
      feature: "concierge_sms",
      model: OPENROUTER_MODEL,
      input: { from, body, channel },
      output: parsed,
      rawText: raw,
      error: errorMsg,
      durationMs: Date.now() - t0,
      refType: reservationId ? "Reservation" : "ConciergeMessage",
      refId: reservationId || inbound.id,
    },
  });

  // Twilio expects TwiML (XML); JSON test clients can use ?format=json
  const wantsJson = request.nextUrl.searchParams.get("format") === "json";
  if (wantsJson) {
    return NextResponse.json({ reply, reservationId, intent: parsed.intent });
  }
  return twiml(reply);
}

export async function GET(request: NextRequest) {
  // List recent messages for the dashboard inbox
  const sp = request.nextUrl.searchParams;
  const page = Math.max(1, parseInt(sp.get("page") || "1"));
  const pageSize = Math.min(100, Math.max(1, parseInt(sp.get("pageSize") || "20")));

  const [data, total] = await Promise.all([
    prisma.conciergeMessage.findMany({
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.conciergeMessage.count(),
  ]);
  return NextResponse.json({
    data,
    pagination: { page, pageSize, totalItems: total, totalPages: Math.ceil(total / pageSize) },
  });
}
