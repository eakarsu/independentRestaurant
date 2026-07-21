import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";

export async function GET(request: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  try {
    const staff = await prisma.staff.findUnique({
      where: { id: params.id },
      include: {
        user: { select: { email: true, role: true } },
        schedules: { orderBy: { date: "desc" }, take: 10 },
        timeClock: { orderBy: { clockIn: "desc" }, take: 10 },
        tips: { orderBy: { date: "desc" }, take: 10 },
        performance: { orderBy: { date: "desc" }, take: 10 },
        training: true,
      },
    });
    if (!staff) {
      return NextResponse.json({ error: "Staff not found" }, { status: 404 });
    }
    return NextResponse.json(staff);
  } catch (error) {
    console.error("Error fetching staff:", error);
    return NextResponse.json({ error: "Failed to fetch staff" }, { status: 500 });
  }
}

export async function PUT(request: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  try {
    const body = await request.json();
    const staff = await prisma.staff.update({
      where: { id: params.id },
      data: {
        firstName: body.firstName,
        lastName: body.lastName,
        phone: body.phone,
        position: body.position,
        hourlyRate: body.hourlyRate,
        status: body.status,
      },
      include: {
        user: { select: { email: true, role: true } },
      },
    });
    return NextResponse.json(staff);
  } catch (error) {
    console.error("Error updating staff:", error);
    return NextResponse.json({ error: "Failed to update staff" }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  try {
    const staff = await prisma.staff.findUnique({
      where: { id: params.id },
      select: { userId: true },
    });

    if (staff) {
      await prisma.staff.delete({ where: { id: params.id } });
      await prisma.user.delete({ where: { id: staff.userId } });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error deleting staff:", error);
    return NextResponse.json({ error: "Failed to delete staff" }, { status: 500 });
  }
}
