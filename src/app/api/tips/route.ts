import { withAccess, MANAGEMENT } from "@/lib/commerce/access";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

async function handleGET() {
  try {
    const tips = await prisma.tipDistribution.findMany({
      include: {
        staff: true,
      },
      orderBy: { date: "desc" },
    });
    return NextResponse.json(tips);
  } catch (error) {
    console.error("Error fetching tips:", error);
    return NextResponse.json({ error: "Failed to fetch tips" }, { status: 500 });
  }
}

async function handlePOST(request: NextRequest) {
  try {
    const body = await request.json();
    const { staffId, amount, source, date } = body;

    const tip = await prisma.tipDistribution.create({
      data: {
        staffId,
        amount,
        source,
        date: new Date(date),
      },
      include: { staff: true },
    });

    return NextResponse.json(tip, { status: 201 });
  } catch (error) {
    console.error("Error creating tip:", error);
    return NextResponse.json({ error: "Failed to create tip" }, { status: 500 });
  }
}

export const GET = withAccess(MANAGEMENT, handleGET);

export const POST = withAccess(MANAGEMENT, handlePOST);
