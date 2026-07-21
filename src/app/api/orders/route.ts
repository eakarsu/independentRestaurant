import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { AuthorizationError, ORDER_READ_ROLES, ORDER_WRITE_ROLES, requireActor } from "@/lib/commerce/authz";
import { createRestaurantOrder } from "@/lib/commerce/orders";
import { getPaginationParams, paginatedResponse } from "@/lib/api-helpers";

function errorResponse(error: unknown) {
  let status = 500;
  if (error instanceof AuthorizationError) status = error.status;
  else if (typeof (error as { status?: unknown }).status === "number") status = (error as { status: number }).status;
  else if ((error as { name?: string }).name === "ZodError") status = 400;
  return NextResponse.json({ error: error instanceof Error ? error.message : "Order request failed" }, { status });
}

export async function GET(request: NextRequest) {
  try {
    const actor = await requireActor(ORDER_READ_ROLES);
    const pagination = getPaginationParams(request);
    const status = request.nextUrl.searchParams.get("status") ?? undefined;
    const where = {
      ...(status ? { status: status as never } : {}),
      ...(actor.role === "CUSTOMER" ? { customer: { userId: actor.userId } } : {}),
    };
    const [orders, total] = await Promise.all([
      prisma.order.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: pagination.skip,
        take: pagination.take,
        include: { customer: true, table: true, items: { include: { menuItem: true } }, delivery: true },
      }),
      prisma.order.count({ where }),
    ]);
    return NextResponse.json(paginatedResponse(orders, total, pagination));
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const actor = await requireActor(ORDER_WRITE_ROLES);
    const idempotencyKey = request.headers.get("idempotency-key");
    if (!idempotencyKey) return NextResponse.json({ error: "Idempotency-Key header is required" }, { status: 400 });
    const order = await createRestaurantOrder({ ...(await request.json()), idempotencyKey }, actor);
    return NextResponse.json(order, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
