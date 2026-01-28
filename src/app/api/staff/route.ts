import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import bcrypt from "bcryptjs";

export async function GET() {
  try {
    const staff = await prisma.staff.findMany({
      orderBy: { firstName: "asc" },
      include: {
        user: {
          select: { email: true, role: true },
        },
      },
    });
    return NextResponse.json(staff);
  } catch (error) {
    console.error("Error fetching staff:", error);
    return NextResponse.json({ error: "Failed to fetch staff" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    // Create user first
    const hashedPassword = await bcrypt.hash(body.password || "password123", 10);
    const user = await prisma.user.create({
      data: {
        email: body.email,
        name: `${body.firstName} ${body.lastName}`,
        password: hashedPassword,
        role: body.role || "STAFF",
      },
    });

    // Create staff profile
    const staff = await prisma.staff.create({
      data: {
        userId: user.id,
        firstName: body.firstName,
        lastName: body.lastName,
        phone: body.phone,
        position: body.position,
        hourlyRate: body.hourlyRate,
        hireDate: body.hireDate ? new Date(body.hireDate) : new Date(),
        status: body.status || "ACTIVE",
      },
      include: {
        user: {
          select: { email: true, role: true },
        },
      },
    });

    return NextResponse.json(staff, { status: 201 });
  } catch (error) {
    console.error("Error creating staff:", error);
    return NextResponse.json({ error: "Failed to create staff member" }, { status: 500 });
  }
}
