import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  try {
    const ingredients = await prisma.ingredient.findMany({
      include: {
        vendor: true,
      },
      orderBy: { name: "asc" },
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
      data: body,
      include: { vendor: true },
    });
    return NextResponse.json(ingredient, { status: 201 });
  } catch (error) {
    console.error("Error creating ingredient:", error);
    return NextResponse.json({ error: "Failed to create ingredient" }, { status: 500 });
  }
}
