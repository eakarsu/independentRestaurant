import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const body = await request.json();
    const { points, type, description } = body;

    // Find or create loyalty points
    let loyalty = await prisma.loyaltyPoints.findUnique({
      where: { customerId: params.id },
    });

    if (!loyalty) {
      loyalty = await prisma.loyaltyPoints.create({
        data: {
          customerId: params.id,
          points: 0,
          lifetimePoints: 0,
        },
      });
    }

    // Create transaction
    await prisma.loyaltyTransaction.create({
      data: {
        loyaltyId: loyalty.id,
        points,
        type: type || "earned",
        description,
      },
    });

    // Update points
    const newPoints = loyalty.points + points;
    const newLifetime = type === "earned" ? loyalty.lifetimePoints + points : loyalty.lifetimePoints;

    // Determine tier
    let tier = "BRONZE";
    if (newLifetime >= 5000) tier = "PLATINUM";
    else if (newLifetime >= 1500) tier = "GOLD";
    else if (newLifetime >= 500) tier = "SILVER";

    const updated = await prisma.loyaltyPoints.update({
      where: { id: loyalty.id },
      data: {
        points: Math.max(0, newPoints),
        lifetimePoints: newLifetime,
        tier: tier as "BRONZE" | "SILVER" | "GOLD" | "PLATINUM",
      },
    });

    return NextResponse.json(updated);
  } catch (error) {
    console.error("Error updating loyalty points:", error);
    return NextResponse.json(
      { error: "Failed to update loyalty points" },
      { status: 500 }
    );
  }
}
