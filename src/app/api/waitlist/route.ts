import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";

export async function GET() {
  try {
    const waitlist = await prisma.waitlist.findMany({
      where: {
        status: {
          in: ["WAITING", "NOTIFIED"],
        },
      },
      orderBy: { createdAt: "asc" },
    });
    return NextResponse.json(waitlist);
  } catch (error) {
    console.error("Error fetching waitlist:", error);
    return NextResponse.json({ error: "Failed to fetch waitlist" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const waitlistEntry = await prisma.waitlist.create({
      data: {
        customerName: body.customerName,
        customerPhone: body.customerPhone,
        partySize: body.partySize,
        estimatedWait: body.estimatedWait,
        quotedTime: body.quotedTime ? new Date(body.quotedTime) : null,
        notes: body.notes,
        status: "WAITING",
      },
    });
    return NextResponse.json(waitlistEntry, { status: 201 });
  } catch (error) {
    console.error("Error creating waitlist entry:", error);
    return NextResponse.json({ error: "Failed to add to waitlist" }, { status: 500 });
  }
}
