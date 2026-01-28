import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const date = searchParams.get("date");
    const status = searchParams.get("status");

    const where: Record<string, unknown> = {};

    if (date) {
      const startOfDay = new Date(date);
      startOfDay.setHours(0, 0, 0, 0);
      const endOfDay = new Date(date);
      endOfDay.setHours(23, 59, 59, 999);
      where.date = {
        gte: startOfDay,
        lt: endOfDay,
      };
    }

    if (status) {
      where.status = status;
    }

    const reservations = await prisma.reservation.findMany({
      where,
      orderBy: [{ date: "asc" }, { time: "asc" }],
      include: {
        table: true,
        customer: true,
      },
    });
    return NextResponse.json(reservations);
  } catch (error) {
    console.error("Error fetching reservations:", error);
    return NextResponse.json({ error: "Failed to fetch reservations" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const reservation = await prisma.reservation.create({
      data: {
        customerName: body.customerName,
        customerPhone: body.customerPhone,
        customerEmail: body.customerEmail,
        partySize: body.partySize,
        date: new Date(body.date),
        time: new Date(body.time),
        tableId: body.tableId,
        status: body.status || "PENDING",
        specialOccasion: body.specialOccasion,
        notes: body.notes,
        source: body.source || "direct",
        customerId: body.customerId,
      },
      include: {
        table: true,
        customer: true,
      },
    });
    return NextResponse.json(reservation, { status: 201 });
  } catch (error) {
    console.error("Error creating reservation:", error);
    return NextResponse.json({ error: "Failed to create reservation" }, { status: 500 });
  }
}
