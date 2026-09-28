/**
 * Assistant capabilities — the remaining AmeritAI parity surface.
 *
 *   GET  /api/customer-ai/capabilities            every capability + connection state
 *   POST /api/customer-ai/capabilities            dispatch one capability
 *
 * Capabilities that need provider credentials report `connected: false` and
 * return the exact request that would have been posted. Nothing is sent, and
 * no image is described, without the provider.
 */
import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getClientIp } from "@/lib/api-helpers";
import { customerAiLimiter } from "@/lib/rate-limit";
import { queueStaffAlert } from "@/lib/operations/notifications";
import {
  abandonRecovery,
  priceAlerts,
  recommendToComplete,
  roiMissedCalls,
  stockAlerts,
} from "@/lib/customer/commerce";
import {
  decideNext,
  proactiveBubble,
  spinWheel,
  voiceConfig,
  widgetTheme,
} from "@/lib/customer/engagement";
import {
  buildSend,
  channelStatus,
  languageSupport,
  requiresHuman,
  translate,
  visualDiagnosis,
} from "@/lib/customer/channels";
import { buildAction, integrationsSummary } from "@/lib/customer/integrations";
import {
  accrueCommission,
  buildContext,
  createSurvey,
  efficiencyScore,
  planCampaign,
  tallySurvey,
} from "@/lib/customer/campaigns";
import { answerDietary, captureEventEnquiry, describeDish, planBooking } from "@/lib/customer/host";

export async function GET() {
  return NextResponse.json({
    channels: channelStatus(),
    integrations: integrationsSummary(),
    languages: languageSupport(),
    capabilities: [
      "smart-shopping",
      "sales-optimization",
      "cart-abandonment",
      "roi-calculator",
      "proactive-engagement",
      "live-decision-engine",
      "gamification",
      "widget-branding",
      "widget-voice",
      "visual-diagnosis",
      "menu-dish",
      "dietary",
      "booking",
      "private-event",
      "survey-create",
      "survey-tally",
      "campaign-plan",
      "dynamic-context",
      "efficiency-score",
      "partner-commission",
      "whatsapp-ai",
      "instagram-ai",
      "phone-receptionist",
      "translate",
    ],
  });
}

export async function POST(request: NextRequest) {
  try {
    const ip = getClientIp(request);
    if (!customerAiLimiter(ip).success) {
      return NextResponse.json(
        { error: "Too many assistant requests. Please try again shortly." },
        { status: 429 },
      );
    }
    const body = await request.json().catch(() => ({}));
    const capability = String(body.capability ?? "");

    switch (capability) {
      /* ----------------------- smart shopping ---------------------- */
      case "smart-shopping": {
        const alerts = priceAlerts(body.wishlist ?? [], body.menu ?? [], body.priceTargets ?? {});
        const stock = stockAlerts(body.wishlist ?? [], body.menu ?? []);
        return NextResponse.json({ priceAlerts: alerts, stockAlerts: stock });
      }

      case "sales-optimization": {
        const recs = recommendToComplete(body.cart ?? [], body.menu ?? [], {
          budgetHeadroom: body.budgetHeadroom,
          max: body.max ?? 3,
          avoidAllergens: body.avoidAllergens ?? [],
        });
        return NextResponse.json({
          recommendations: recs,
          note: "Every suggestion names the rule that chose it. Nothing is invented.",
        });
      }

      case "cart-abandonment": {
        const r = abandonRecovery(body.cart ?? [], {
          minutesSince: Number(body.minutesSince ?? 0),
          phone: body.phone ?? null,
          restaurantName: body.restaurantName,
        });
        return NextResponse.json(r);
      }

      case "roi-calculator": {
        const r = roiMissedCalls(body.input ?? {}, { annualCost: body.annualCost });
        return NextResponse.json(r);
      }

      /* ------------------------ engagement ------------------------- */
      case "proactive-engagement":
        return NextResponse.json(proactiveBubble(body.signal ?? body));

      case "live-decision-engine":
        return NextResponse.json(decideNext(body.state ?? body));

      case "gamification": {
        const prizes = body.prizes ?? [];
        const result = spinWheel(prizes);
        return NextResponse.json({ ...result, prizeTable: prizes });
      }

      case "widget-branding":
        return NextResponse.json(widgetTheme(body.theme ?? {}));

      case "widget-voice":
        return NextResponse.json(voiceConfig(body.config ?? {}));

      /* -------------------------- channels ------------------------- */
      case "whatsapp-ai":
      case "instagram-ai":
      case "phone-receptionist": {
        const channel =
          capability === "whatsapp-ai" ? "whatsapp" : capability === "instagram-ai" ? "instagram" : "phone";
        const r = buildSend({
          channel,
          to: String(body.to ?? ""),
          body: String(body.body ?? ""),
        });
        return NextResponse.json(r, { status: r.accepted ? 201 : 503 });
      }

      case "translate": {
        const r = translate(body.key ?? "greeting", body.language ?? "en");
        return NextResponse.json(r);
      }

      case "visual-diagnosis": {
        const r = visualDiagnosis({
          imageUrl: body.imageUrl,
          imageBase64: body.imageBase64,
          subject: String(body.subject ?? ""),
        });
        return NextResponse.json(
          { ...r, requiresHumanReview: requiresHuman(body.subject ?? "") || r.requiresHumanReview },
          { status: r.analysed ? 200 : 503 },
        );
      }

      /* ------------------------ integrations ----------------------- */
      case "integration-action": {
        const r = buildAction({
          integration: body.integration,
          action: String(body.action ?? ""),
          payload: body.payload ?? {},
        });
        return NextResponse.json(r, { status: r.performed ? 201 : 503 });
      }

      case "menu-dish": {
        const items = await prisma.menuItem.findMany({ where: { isAvailable: true, is86d: false }, select: { id: true, name: true, description: true, price: true, allergens: true, isAvailable: true, is86d: true }, take: 200 });
        return NextResponse.json(describeDish(String(body.question ?? ""), items as any));
      }
      case "dietary": {
        const items = await prisma.menuItem.findMany({ where: { isAvailable: true, is86d: false }, select: { id: true, name: true, description: true, price: true, allergens: true, isAvailable: true, is86d: true }, take: 200 });
        return NextResponse.json(answerDietary(String(body.question ?? ""), items as any));
      }
      case "booking": {
        const plan = planBooking(body.booking ?? body);
        if (plan.missingFields.length) return NextResponse.json(plan, { status: 400 });
        const b = body.booking ?? body;
        const partySize = Number(b.partySize ?? 0);
        const requestedDate = new Date(String(b.date));
        if (!Number.isInteger(partySize) || partySize < 1 || partySize > 100)
          return NextResponse.json(
            { ...plan, created: false, error: "partySize must be between 1 and 100" },
            { status: 400 },
          );
        if (Number.isNaN(requestedDate.getTime()) || requestedDate.getTime() < Date.now() - 86400000)
          return NextResponse.json(
            { ...plan, created: false, error: "date must be a valid future date" },
            { status: 400 },
          );
        const preferredAt = new Date(`${String(b.date)}T${String(b.time ?? "00:00")}`);
        const sessionId = String(b.sessionId ?? body.sessionId ?? "assistant")
          .replace(/[^\w-]/g, "")
          .slice(0, 100) || "assistant";
        try {
          // Unauthenticated booking requests become staff-reviewed leads, not
          // reservations: capacity, hours and table conflicts are only checked
          // by the authenticated reservations workflow.
          const lead = await prisma.customerLead.create({
            data: {
              sessionId,
              name: String(b.customerName ?? "Guest").slice(0, 200),
              email: b.customerEmail ? String(b.customerEmail).slice(0, 254) : null,
              phone: String(b.customerPhone ?? "").slice(0, 40),
              partySize,
              preferredAt: Number.isNaN(preferredAt.getTime()) ? requestedDate : preferredAt,
              note: `Booking request via assistant${b.note ? `: ${String(b.note).slice(0, 300)}` : ""}`,
              source: "assistant-booking",
            },
          });
          await queueStaffAlert({
            subject: plan.staffNotification.subject,
            message: plan.staffNotification.body,
            metadata: { leadId: lead.id, sessionId },
          }).catch(() => null);
          return NextResponse.json(
            {
              ...plan,
              created: false,
              requested: true,
              requestId: lead.id,
              confirmationMessage:
                "Thanks — your booking request is with the team. They will confirm it shortly.",
            },
            { status: 201 },
          );
        } catch (e: any) {
          return NextResponse.json({ ...plan, created: false, error: e?.message }, { status: 503 });
        }
      }
      /* ---- survey, campaign, context, efficiency, partners ---- */
      case "survey-create": {
        return NextResponse.json(createSurvey({ id: String(body.id ?? 'survey'), title: String(body.title ?? ''), description: body.description, questions: body.questions ?? [] }), { status: 201 });
      }
      case "survey-tally": {
        const def = createSurvey({ id: String(body.id ?? 'survey'), title: String(body.title ?? 'Survey'), questions: body.questions ?? [] });
        return NextResponse.json({ tallies: tallySurvey(def, body.responses ?? []) });
      }
      case "campaign-plan": {
        const plan = planCampaign({ id: String(body.id ?? 'campaign'), goal: body.goal, audienceRule: String(body.audienceRule ?? ''), budgetCents: body.budgetCents ?? null });
        return NextResponse.json(plan, { status: 201 });
      }
      case "dynamic-context": {
        return NextResponse.json(buildContext(body.sections ?? []));
      }
      case "efficiency-score": {
        return NextResponse.json(efficiencyScore(body.inputs ?? {}));
      }
      case "partner-commission": {
        return NextResponse.json(accrueCommission(body.referrals ?? [], { ratePct: Number(body.ratePct ?? 20), months: body.months }));
      }
      case "private-event": {
        const r = captureEventEnquiry(body.enquiry ?? body);
        return NextResponse.json(r, { status: r.captured ? 201 : 400 });
      }
      default:
        return NextResponse.json(
          { error: `Unknown capability: ${capability || "(empty)"}` },
          { status: 400 },
        );
    }
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Capability failed" }, { status: 400 });
  }
}