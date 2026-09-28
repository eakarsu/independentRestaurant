import { withAccess, MANAGEMENT, OPERATIONS } from "@/lib/commerce/access";
import { NextRequest, NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import prisma from "@/lib/prisma";

const EDITABLE_FIELDS = [
  "categoryId",
  "name",
  "description",
  "price",
  "cost",
  "imageUrl",
  "allergens",
  "isAvailable",
  "is86d",
  "isSpecial",
  "calories",
  "prepTime",
] as const;

const DATE_FIELDS = ["specialStartDate", "specialEndDate"] as const;

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
    const body = await request.json().catch(() => null);
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return NextResponse.json({ error: "A JSON object body is required" }, { status: 400 });
    }
    const payload = body as Record<string, unknown>;
    const data: Record<string, unknown> = {};

    // Only write keys the caller actually sent. The 86-toggle posts just
    // {is86d} and must not clear unrelated columns such as the special-price
    // window.
    for (const field of EDITABLE_FIELDS) {
      if (field in payload) data[field] = payload[field];
    }
    for (const field of DATE_FIELDS) {
      if (!(field in payload)) continue;
      const value = payload[field];
      if (value === null) {
        data[field] = null;
      } else {
        const date = typeof value === "string" || typeof value === "number" ? new Date(value) : new Date(NaN);
        if (Number.isNaN(date.getTime())) {
          return NextResponse.json({ error: `${field} must be a valid date or null` }, { status: 422 });
        }
        data[field] = date;
      }
    }

    const item = await prisma.menuItem.update({
      where: { id: params.id },
      data: data as Prisma.MenuItemUpdateInput,
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
