import { recordMutation, recordMutationFailure } from "@/lib/record-mutation";
import { withAccess, MANAGEMENT, OPERATIONS } from "@/lib/commerce/access";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

async function handleGET() {
  try {
    const recipes = await prisma.recipe.findMany({
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
      orderBy: { menuItem: { name: "asc" } },
    });
    return NextResponse.json(recipes);
  } catch (error) {
    const cancelled = recordMutationFailure(error); if (cancelled) return cancelled;
    console.error("Error fetching recipes:", error);
    return NextResponse.json(
      { error: "Failed to fetch recipes" },
      { status: 500 }
    );
  }
}

async function handlePOST(request: NextRequest) {
  try {
    const body = await request.json();
    const recipe = await recordMutation(request, tx => tx.recipe.create({
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
    }));
    return NextResponse.json(recipe, { status: 201 });
  } catch (error) {
    const cancelled = recordMutationFailure(error); if (cancelled) return cancelled;
    console.error("Error creating recipe:", error);
    return NextResponse.json(
      { error: "Failed to create recipe" },
      { status: 500 }
    );
  }
}

export const GET = withAccess(OPERATIONS, handleGET);

export const POST = withAccess(MANAGEMENT, handlePOST);
