import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const search = searchParams.get("search");
    const vip = searchParams.get("vip");

    const where: Record<string, unknown> = {};

    if (search) {
      where.OR = [
        { firstName: { contains: search, mode: "insensitive" } },
        { lastName: { contains: search, mode: "insensitive" } },
        { email: { contains: search, mode: "insensitive" } },
        { phone: { contains: search } },
      ];
    }

    if (vip === "true") {
      where.vipStatus = true;
    }

    const customers = await prisma.customer.findMany({
      where,
      orderBy: { lastName: "asc" },
      include: {
        loyaltyPoints: true,
        _count: {
          select: { orders: true, reservations: true },
        },
      },
    });
    return NextResponse.json(customers);
  } catch (error) {
    console.error("Error fetching customers:", error);
    return NextResponse.json({ error: "Failed to fetch customers" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const customer = await prisma.customer.create({
      data: {
        firstName: body.firstName,
        lastName: body.lastName,
        email: body.email,
        phone: body.phone,
        address: body.address,
        birthday: body.birthday ? new Date(body.birthday) : null,
        anniversary: body.anniversary ? new Date(body.anniversary) : null,
        dietaryPrefs: body.dietaryPrefs || [],
        allergens: body.allergens || [],
        notes: body.notes,
        vipStatus: body.vipStatus || false,
        loyaltyPoints: {
          create: {
            points: 0,
            tier: "BRONZE",
            lifetimePoints: 0,
          },
        },
      },
      include: {
        loyaltyPoints: true,
      },
    });
    return NextResponse.json(customer, { status: 201 });
  } catch (error) {
    console.error("Error creating customer:", error);
    return NextResponse.json({ error: "Failed to create customer" }, { status: 500 });
  }
}
