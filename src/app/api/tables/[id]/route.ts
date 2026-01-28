import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const table = await prisma.table.findUnique({
      where: { id: params.id },
      include: {
        reservations: true,
        orders: true,
      },
    });
    if (!table) {
      return NextResponse.json({ error: "Table not found" }, { status: 404 });
    }
    return NextResponse.json(table);
  } catch (error) {
    console.error("Error fetching table:", error);
    return NextResponse.json({ error: "Failed to fetch table" }, { status: 500 });
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const body = await request.json();
    const table = await prisma.table.update({
      where: { id: params.id },
      data: {
        number: body.number,
        capacity: body.capacity,
        section: body.section,
        status: body.status,
        posX: body.posX,
        posY: body.posY,
      },
    });
    return NextResponse.json(table);
  } catch (error) {
    console.error("Error updating table:", error);
    return NextResponse.json({ error: "Failed to update table" }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    await prisma.table.delete({
      where: { id: params.id },
    });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error deleting table:", error);
    return NextResponse.json({ error: "Failed to delete table" }, { status: 500 });
  }
}
