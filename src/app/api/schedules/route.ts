import { withAccess, MANAGEMENT } from "@/lib/commerce/access";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

async function handleGET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const startDate = searchParams.get("startDate");
    const endDate = searchParams.get("endDate");

    const where: Record<string, unknown> = {};
    if (startDate && endDate) {
      where.date = {
        gte: new Date(startDate),
        lte: new Date(endDate),
      };
    }

    const schedules = await prisma.schedule.findMany({
      where,
      include: {
        staff: {
          include: {
            user: true,
          },
        },
      },
      orderBy: [{ date: "asc" }, { startTime: "asc" }],
    });

    return NextResponse.json(schedules);
  } catch (error) {
    console.error("Error fetching schedules:", error);
    return NextResponse.json(
      { error: "Failed to fetch schedules" },
      { status: 500 }
    );
  }
}

async function handlePOST(request: NextRequest) {
  try {
    const body = await request.json();
    const { staffId, date, startTime, endTime, position, notes } = body;

    // Append T12:00:00 to date to avoid timezone shifts across day boundaries
    const dateAtNoon = new Date(`${date}T12:00:00`);

    const schedule = await prisma.schedule.create({
      data: {
        staffId,
        date: dateAtNoon,
        startTime: new Date(startTime),
        endTime: new Date(endTime),
        position,
        notes,
      },
      include: {
        staff: {
          include: { user: true },
        },
      },
    });

    return NextResponse.json(schedule, { status: 201 });
  } catch (error) {
    console.error("Error creating schedule:", error);
    return NextResponse.json(
      { error: "Failed to create schedule" },
      { status: 500 }
    );
  }
}

export const GET = withAccess(MANAGEMENT, handleGET);

export const POST = withAccess(MANAGEMENT, handlePOST);
