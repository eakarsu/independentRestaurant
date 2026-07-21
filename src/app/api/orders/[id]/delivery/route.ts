import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import prisma from "@/lib/prisma";
import { AuthorizationError, ORDER_CONTROL_ROLES, requireActor } from "@/lib/commerce/authz";

const schema = z.object({
  driverName: z.string().trim().max(120).optional(),
  driverPhone: z.string().trim().max(40).optional(),
  instructions: z.string().trim().max(500).optional(),
  estimatedTime: z.string().datetime().optional(),
  deliveredAt: z.string().datetime().optional(),
}).strict();

export async function PUT(request: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  try {
    await requireActor(ORDER_CONTROL_ROLES);
    const body = schema.parse(await request.json());
    const delivery = await prisma.deliveryInfo.update({
      where: { orderId: params.id },
      data: { ...body, estimatedTime: body.estimatedTime ? new Date(body.estimatedTime) : undefined, deliveredAt: body.deliveredAt ? new Date(body.deliveredAt) : undefined },
    });
    return NextResponse.json(delivery);
  } catch (error) {
    const status = error instanceof AuthorizationError ? error.status : (error as { name?: string }).name === "ZodError" ? 400 : 404;
    return NextResponse.json({ error: error instanceof Error ? error.message : "Delivery update failed" }, { status });
  }
}
