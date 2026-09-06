import { withAccess, MANAGEMENT } from "@/lib/commerce/access";
import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";

async function handleGET(request: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  try {
    const searchParams = request.nextUrl.searchParams;
    const startDate = searchParams.get("startDate");
    const endDate = searchParams.get("endDate");

    const where: Record<string, unknown> = { staffId: params.id };

    if (startDate && endDate) {
      where.date = {
        gte: new Date(startDate),
        lte: new Date(endDate),
      };
    }

    const schedules = await prisma.schedule.findMany({
      where,
      orderBy: { date: "asc" },
    });
    return NextResponse.json(schedules);
  } catch (error) {
    console.error("Error fetching schedules:", error);
    return NextResponse.json({ error: "Failed to fetch schedules" }, { status: 500 });
  }
}

async function handlePOST(request: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  try {
    const body = await request.json();
    const schedule = await prisma.schedule.create({
      data: {
        staffId: params.id,
        date: new Date(body.date),
        startTime: new Date(body.startTime),
        endTime: new Date(body.endTime),
        position: body.position,
        notes: body.notes,
      },
    });
    return NextResponse.json(schedule, { status: 201 });
  } catch (error) {
    console.error("Error creating schedule:", error);
    return NextResponse.json({ error: "Failed to create schedule" }, { status: 500 });
  }
}

export const GET = withAccess(MANAGEMENT, handleGET);

export const POST = withAccess(["ADMIN", "MERCHANT"], handlePOST);
