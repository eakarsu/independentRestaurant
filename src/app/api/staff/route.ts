import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import bcrypt from "bcryptjs";
import { getPaginationParams, getSortParams, paginatedResponse, handleApiError } from "@/lib/api-helpers";

export async function GET(request: NextRequest) {
  try {
    const pagination = getPaginationParams(request);
    const sort = getSortParams(request, "firstName");

    const [staff, total] = await Promise.all([
      prisma.staff.findMany({
        orderBy: { [sort.sortBy]: sort.sortDirection },
        skip: pagination.skip,
        take: pagination.take,
        include: {
          user: {
            select: { email: true, role: true },
          },
        },
      }),
      prisma.staff.count(),
    ]);

    return NextResponse.json(paginatedResponse(staff, total, pagination));
  } catch (error) {
    return handleApiError(error, "Staff");
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    const hashedPassword = await bcrypt.hash(body.password || "password123", 10);
    const user = await prisma.user.create({
      data: {
        email: body.email,
        name: `${body.firstName} ${body.lastName}`,
        password: hashedPassword,
        role: body.role || "STAFF",
      },
    });

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
