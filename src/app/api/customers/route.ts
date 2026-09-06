import { withAccess, MANAGEMENT, OPERATIONS } from "@/lib/commerce/access";
import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getPaginationParams, getSortParams, paginatedResponse, handleApiError } from "@/lib/api-helpers";

async function handleGET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const search = searchParams.get("search");
    const vip = searchParams.get("vip");
    const pagination = getPaginationParams(request);
    const sort = getSortParams(request, "lastName");

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

    const [customers, total] = await Promise.all([
      prisma.customer.findMany({
        where,
        orderBy: { [sort.sortBy]: sort.sortDirection },
        skip: pagination.skip,
        take: pagination.take,
        include: {
          loyaltyPoints: true,
          _count: {
            select: { orders: true, reservations: true },
          },
        },
      }),
      prisma.customer.count({ where }),
    ]);

    return NextResponse.json(paginatedResponse(customers, total, pagination));
  } catch (error) {
    return handleApiError(error, "Customers");
  }
}

async function handlePOST(request: NextRequest) {
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

export const GET = withAccess(OPERATIONS, handleGET);

export const POST = withAccess(MANAGEMENT, handlePOST);
