import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const body = await request.json();

    const delivery = await prisma.deliveryInfo.update({
      where: { orderId: params.id },
      data: {
        ...body,
        deliveredAt: body.deliveredAt ? new Date(body.deliveredAt) : undefined,
        estimatedTime: body.estimatedTime ? new Date(body.estimatedTime) : undefined,
      },
    });

    return NextResponse.json(delivery);
  } catch (error) {
    console.error("Error updating delivery:", error);
    return NextResponse.json(
      { error: "Failed to update delivery" },
      { status: 500 }
    );
  }
}
