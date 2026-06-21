import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// Default catalog of integrations the restaurant can connect to. Used to seed
// the database the first time the page is loaded so the UI is data-driven.
const DEFAULT_INTEGRATIONS = [
  { type: "pos", name: "POS Systems", isActive: false, config: { desc: "Connect to Square, Toast, Clover" } },
  { type: "delivery", name: "DoorDash", isActive: true, config: { desc: "Receive delivery orders from DoorDash" } },
  { type: "delivery", name: "Uber Eats", isActive: false, config: { desc: "Receive delivery orders from Uber Eats" } },
  { type: "delivery", name: "Grubhub", isActive: false, config: { desc: "Receive delivery orders from Grubhub" } },
  { type: "reservations", name: "OpenTable", isActive: true, config: { desc: "Sync reservations with OpenTable" } },
  { type: "reservations", name: "Resy", isActive: false, config: { desc: "Sync reservations with Resy" } },
  { type: "payments", name: "Stripe", isActive: true, config: { desc: "Process payments with Stripe" } },
  { type: "payments", name: "Square Payments", isActive: false, config: { desc: "Process payments with Square" } },
  { type: "accounting", name: "QuickBooks", isActive: false, config: { desc: "Sync financial data to QuickBooks" } },
  { type: "accounting", name: "Xero", isActive: false, config: { desc: "Sync financial data to Xero" } },
  { type: "reviews", name: "Google Reviews", isActive: true, config: { desc: "Monitor and respond to Google reviews" } },
  { type: "reviews", name: "Yelp", isActive: false, config: { desc: "Monitor and respond to Yelp reviews" } },
];

export async function GET() {
  try {
    // Seed the catalog on first run so toggles have something to persist to.
    const count = await prisma.integration.count();
    if (count === 0) {
      await prisma.integration.createMany({
        data: DEFAULT_INTEGRATIONS.map((i) => ({
          type: i.type,
          name: i.name,
          isActive: i.isActive,
          config: i.config,
          lastSync: i.isActive ? new Date() : null,
        })),
      });
    }

    const integrations = await prisma.integration.findMany({
      orderBy: { createdAt: "asc" },
    });

    return NextResponse.json(integrations);
  } catch (error) {
    console.error("Error fetching integrations:", error);
    return NextResponse.json(
      { error: "Failed to fetch integrations" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { type, name, config, isActive } = body;

    if (!type || !name) {
      return NextResponse.json(
        { error: "type and name are required" },
        { status: 400 }
      );
    }

    const integration = await prisma.integration.create({
      data: {
        type,
        name,
        isActive: Boolean(isActive),
        config: config ?? undefined,
        lastSync: isActive ? new Date() : null,
      },
    });

    return NextResponse.json(integration, { status: 201 });
  } catch (error) {
    console.error("Error creating integration:", error);
    return NextResponse.json(
      { error: "Failed to create integration" },
      { status: 500 }
    );
  }
}
