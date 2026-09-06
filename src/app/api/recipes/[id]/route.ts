import { withAccess, MANAGEMENT, OPERATIONS } from "@/lib/commerce/access";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

async function handleGET(request: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  try {
    const recipe = await prisma.recipe.findUnique({
      where: { id: params.id },
      include: {
        menuItem: {
          include: {
            category: true,
            ingredients: {
              include: {
                ingredient: true,
              },
            },
          },
        },
      },
    });

    if (!recipe) {
      return NextResponse.json({ error: "Recipe not found" }, { status: 404 });
    }

    return NextResponse.json(recipe);
  } catch (error) {
    console.error("Error fetching recipe:", error);
    return NextResponse.json(
      { error: "Failed to fetch recipe" },
      { status: 500 }
    );
  }
}

async function handlePUT(request: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  try {
    const body = await request.json();
    const recipe = await prisma.recipe.update({
      where: { id: params.id },
      data: body,
      include: {
        menuItem: {
          include: {
            category: true,
            ingredients: {
              include: {
                ingredient: true,
              },
            },
          },
        },
      },
    });
    return NextResponse.json(recipe);
  } catch (error) {
    console.error("Error updating recipe:", error);
    return NextResponse.json(
      { error: "Failed to update recipe" },
      { status: 500 }
    );
  }
}

async function handleDELETE(request: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  try {
    await prisma.recipe.delete({
      where: { id: params.id },
    });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error deleting recipe:", error);
    return NextResponse.json(
      { error: "Failed to delete recipe" },
      { status: 500 }
    );
  }
}

export const GET = withAccess(OPERATIONS, handleGET);

export const PUT = withAccess(MANAGEMENT, handlePUT);

export const DELETE = withAccess(MANAGEMENT, handleDELETE);
