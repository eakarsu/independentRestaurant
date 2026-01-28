import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  try {
    const locations = await prisma.location.findMany({
      orderBy: [{ isPrimary: "desc" }, { name: "asc" }],
    });
    return NextResponse.json(locations);
  } catch (error) {
    console.error("Error fetching locations:", error);
    return NextResponse.json(
      { error: "Failed to fetch locations" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    // If this is being set as primary, unset other primary locations
    if (body.isPrimary) {
      await prisma.location.updateMany({
        where: { isPrimary: true },
        data: { isPrimary: false },
      });
    }

    const location = await prisma.location.create({
      data: body,
    });
    return NextResponse.json(location, { status: 201 });
  } catch (error) {
    console.error("Error creating location:", error);
    return NextResponse.json(
      { error: "Failed to create location" },
      { status: 500 }
    );
  }
}
