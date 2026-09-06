import { withAccess, MANAGEMENT, OPERATIONS } from "@/lib/commerce/access";
import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";

async function handleGET(request: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  try {
    const item = await prisma.menuItem.findUnique({
      where: { id: params.id },
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
        ingredients: {
          include: {
            ingredient: true,
          },
        },
      },
    });
    if (!item) {
      return NextResponse.json({ error: "Menu item not found" }, { status: 404 });
    }
    return NextResponse.json(item);
  } catch (error) {
    console.error("Error fetching menu item:", error);
    return NextResponse.json({ error: "Failed to fetch menu item" }, { status: 500 });
  }
}

async function handlePUT(request: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  try {
    const body = await request.json();
    const item = await prisma.menuItem.update({
      where: { id: params.id },
      data: {
        categoryId: body.categoryId,
        name: body.name,
        description: body.description,
        price: body.price,
        cost: body.cost,
        imageUrl: body.imageUrl,
        allergens: body.allergens,
        isAvailable: body.isAvailable,
        is86d: body.is86d,
        isSpecial: body.isSpecial,
        specialStartDate: body.specialStartDate ? new Date(body.specialStartDate) : null,
        specialEndDate: body.specialEndDate ? new Date(body.specialEndDate) : null,
        calories: body.calories,
        prepTime: body.prepTime,
      },
      include: {
        category: true,
      },
    });
    return NextResponse.json(item);
  } catch (error) {
    console.error("Error updating menu item:", error);
    return NextResponse.json({ error: "Failed to update menu item" }, { status: 500 });
  }
}

async function handleDELETE(request: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  try {
    await prisma.menuItem.delete({
      where: { id: params.id },
    });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error deleting menu item:", error);
    return NextResponse.json({ error: "Failed to delete menu item" }, { status: 500 });
  }
}

export const GET = withAccess(OPERATIONS, handleGET);

export const PUT = withAccess(MANAGEMENT, handlePUT);

export const DELETE = withAccess(MANAGEMENT, handleDELETE);
