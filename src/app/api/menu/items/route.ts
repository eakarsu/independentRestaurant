import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getPaginationParams, getSortParams, paginatedResponse, handleApiError } from "@/lib/api-helpers";

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const categoryId = searchParams.get("categoryId");
    const available = searchParams.get("available");
    const pagination = getPaginationParams(request);
    const sort = getSortParams(request, "name");

    const where: Record<string, unknown> = {};

    if (categoryId) {
      where.categoryId = categoryId;
    }

    if (available === "true") {
      where.isAvailable = true;
      where.is86d = false;
    }

    const [items, total] = await Promise.all([
      prisma.menuItem.findMany({
        where,
        orderBy: { [sort.sortBy]: sort.sortDirection },
        skip: pagination.skip,
        take: pagination.take,
        include: {
          category: true,
          modifierGroups: {
            include: {
              modifierGroup: {
                include: {
                  modifiers: true,
                },
              },
            },
          },
        },
      }),
      prisma.menuItem.count({ where }),
    ]);

    return NextResponse.json(paginatedResponse(items, total, pagination));
  } catch (error) {
    return handleApiError(error, "Menu Items");
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const item = await prisma.menuItem.create({
      data: {
        categoryId: body.categoryId,
        name: body.name,
        description: body.description,
        price: body.price,
        cost: body.cost,
        imageUrl: body.imageUrl,
        allergens: body.allergens || [],
        isAvailable: body.isAvailable ?? true,
        is86d: body.is86d ?? false,
        isSpecial: body.isSpecial ?? false,
        specialStartDate: body.specialStartDate ? new Date(body.specialStartDate) : null,
        specialEndDate: body.specialEndDate ? new Date(body.specialEndDate) : null,
        calories: body.calories,
        prepTime: body.prepTime,
      },
      include: {
        category: true,
      },
    });
    return NextResponse.json(item, { status: 201 });
  } catch (error) {
    console.error("Error creating menu item:", error);
    return NextResponse.json({ error: "Failed to create menu item" }, { status: 500 });
  }
}
