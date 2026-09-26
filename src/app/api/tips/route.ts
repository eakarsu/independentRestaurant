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

    // Previously unvalidated: a negative or non-numeric amount, an unknown
    // staff id or an unparseable date were all written straight to the table.
    if (typeof staffId !== "string" || !staffId.trim()) {
      return NextResponse.json({ error: "staffId is required" }, { status: 400 });
    }
    const amountNumber = Number(amount);
    if (!Number.isFinite(amountNumber) || amountNumber <= 0) {
      return NextResponse.json(
        { error: "amount must be a positive number" },
        { status: 400 },
      );
    }
    const parsedDate = new Date(date);
    if (Number.isNaN(parsedDate.getTime())) {
      return NextResponse.json({ error: "date is invalid" }, { status: 400 });
    }
    const allowedSources = ["cash", "card", "pooled"];
    if (!allowedSources.includes(source)) {
      return NextResponse.json(
        { error: `source must be one of: ${allowedSources.join(", ")}` },
        { status: 400 },
      );
    }

    const staff = await prisma.staff.findUnique({ where: { id: staffId } });
    if (!staff) {
      return NextResponse.json({ error: "Staff member not found" }, { status: 404 });
    }

    const tip = await prisma.tipDistribution.create({
      data: {
        staffId,
        amount: amountNumber,
        source,
        date: parsedDate,
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
