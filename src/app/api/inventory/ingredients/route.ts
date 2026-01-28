import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";

export async function GET() {
  try {
    const ingredients = await prisma.ingredient.findMany({
      orderBy: { name: "asc" },
      include: { vendor: true },
    });
    return NextResponse.json(ingredients);
  } catch (error) {
    console.error("Error fetching ingredients:", error);
    return NextResponse.json({ error: "Failed to fetch ingredients" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const ingredient = await prisma.ingredient.create({
      data: {
        name: body.name,
        unit: body.unit,
        currentStock: body.currentStock || 0,
        parLevel: body.parLevel || 0,
        reorderPoint: body.reorderPoint || 0,
        cost: body.cost || 0,
        vendorId: body.vendorId,
      },
      include: { vendor: true },
    });
    return NextResponse.json(ingredient, { status: 201 });
  } catch (error) {
    console.error("Error creating ingredient:", error);
    return NextResponse.json({ error: "Failed to create ingredient" }, { status: 500 });
  }
}
