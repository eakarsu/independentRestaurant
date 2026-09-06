import { withAccess, MANAGEMENT } from "@/lib/commerce/access";
import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";

async function handlePUT(request: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  try {
    const body = await request.json();
    const ingredient = await prisma.ingredient.update({
      where: { id: params.id },
      data: {
        name: body.name,
        unit: body.unit,
        currentStock: body.currentStock,
        parLevel: body.parLevel,
        reorderPoint: body.reorderPoint,
        cost: body.cost,
        vendorId: body.vendorId,
      },
      include: { vendor: true },
    });
    return NextResponse.json(ingredient);
  } catch (error) {
    console.error("Error updating ingredient:", error);
    return NextResponse.json({ error: "Failed to update ingredient" }, { status: 500 });
  }
}

async function handleDELETE(request: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  try {
    await prisma.ingredient.delete({
      where: { id: params.id },
    });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error deleting ingredient:", error);
    return NextResponse.json({ error: "Failed to delete ingredient" }, { status: 500 });
  }
}

export const PUT = withAccess(MANAGEMENT, handlePUT);

export const DELETE = withAccess(MANAGEMENT, handleDELETE);
