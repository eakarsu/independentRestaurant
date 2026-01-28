import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";

export async function GET() {
  try {
    const tables = await prisma.table.findMany({
      orderBy: { number: "asc" },
      include: {
        reservations: {
          where: {
            date: {
              gte: new Date(new Date().setHours(0, 0, 0, 0)),
              lt: new Date(new Date().setHours(23, 59, 59, 999)),
            },
            status: {
              in: ["PENDING", "CONFIRMED", "SEATED"],
            },
          },
        },
      },
    });
    return NextResponse.json(tables);
  } catch (error) {
    console.error("Error fetching tables:", error);
    return NextResponse.json({ error: "Failed to fetch tables" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const table = await prisma.table.create({
      data: {
        number: body.number,
        capacity: body.capacity,
        section: body.section,
        status: body.status || "AVAILABLE",
        posX: body.posX,
        posY: body.posY,
      },
    });
    return NextResponse.json(table, { status: 201 });
  } catch (error) {
    console.error("Error creating table:", error);
    return NextResponse.json({ error: "Failed to create table" }, { status: 500 });
  }
}
