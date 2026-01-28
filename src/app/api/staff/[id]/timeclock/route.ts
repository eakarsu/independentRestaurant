import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const body = await request.json();

    if (body.action === "clockIn") {
      const timeClock = await prisma.timeClock.create({
        data: {
          staffId: params.id,
          clockIn: new Date(),
        },
      });
      return NextResponse.json(timeClock, { status: 201 });
    }

    if (body.action === "clockOut") {
      const openEntry = await prisma.timeClock.findFirst({
        where: {
          staffId: params.id,
          clockOut: null,
        },
        orderBy: { clockIn: "desc" },
      });

      if (!openEntry) {
        return NextResponse.json({ error: "No open clock entry found" }, { status: 400 });
      }

      const clockOut = new Date();
      const totalHours = (clockOut.getTime() - openEntry.clockIn.getTime()) / (1000 * 60 * 60);

      const timeClock = await prisma.timeClock.update({
        where: { id: openEntry.id },
        data: {
          clockOut,
          totalHours,
        },
      });
      return NextResponse.json(timeClock);
    }

    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  } catch (error) {
    console.error("Error with time clock:", error);
    return NextResponse.json({ error: "Failed to process time clock" }, { status: 500 });
  }
}
