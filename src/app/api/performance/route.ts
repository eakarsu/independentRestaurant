import { withAccess, MANAGEMENT } from "@/lib/commerce/access";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

async function handleGET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const staffId = searchParams.get("staffId");
    const startDate = searchParams.get("startDate");
    const endDate = searchParams.get("endDate");

    const where: Record<string, unknown> = {};
    if (staffId) where.staffId = staffId;
    if (startDate && endDate) {
      where.date = {
        gte: new Date(startDate),
        lte: new Date(endDate),
      };
    }

    const records = await prisma.performanceRecord.findMany({
      where,
      include: {
        staff: {
          select: {
            firstName: true,
            lastName: true,
            position: true,
          },
        },
      },
      orderBy: { date: "desc" },
    });

    return NextResponse.json(records);
  } catch (error) {
    console.error("Error fetching performance records:", error);
    return NextResponse.json(
      { error: "Failed to fetch performance records" },
      { status: 500 }
    );
  }
}

async function handlePOST(request: NextRequest) {
  try {
    const body = await request.json();
    const { staffId, metric, value, notes, date } = body;

    const record = await prisma.performanceRecord.create({
      data: {
        staffId,
        metric,
        value,
        notes,
        date: date ? new Date(date) : new Date(),
      },
      include: {
        staff: {
          select: {
            firstName: true,
            lastName: true,
            position: true,
          },
        },
      },
    });

    return NextResponse.json(record, { status: 201 });
  } catch (error) {
    console.error("Error creating performance record:", error);
    return NextResponse.json(
      { error: "Failed to create performance record" },
      { status: 500 }
    );
  }
}

export const GET = withAccess(MANAGEMENT, handleGET);

export const POST = withAccess(MANAGEMENT, handlePOST);
