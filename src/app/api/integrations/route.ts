import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { AuthorizationError, REFUND_ROLES, requireActor } from "@/lib/commerce/authz";

export async function GET() {
  try {
    await requireActor(REFUND_ROLES);
    const integrations = await prisma.integration.findMany({ orderBy: { createdAt: "asc" } });
    return NextResponse.json({
      integrations: integrations.map((integration) => ({ ...integration, config: undefined })),
      runtime: {
        tax: Boolean(process.env.TAX_PROVIDER_URL || process.env.TAX_RATE_BPS),
        inventory: true,
        payment: Boolean(process.env.STRIPE_SECRET_KEY && process.env.STRIPE_WEBHOOK_SECRET),
        fulfillment: Boolean(process.env.FULFILLMENT_PROVIDER_URL && process.env.FULFILLMENT_PROVIDER_TOKEN),
      },
    });
  } catch (error) {
    const status = error instanceof AuthorizationError ? error.status : 500;
    return NextResponse.json({ error: error instanceof Error ? error.message : "Failed to fetch integrations" }, { status });
  }
}

export async function POST() {
  return NextResponse.json({ error: "Provider credentials are configured only through the secret store/environment" }, { status: 405 });
}
