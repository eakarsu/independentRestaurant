import { NextRequest, NextResponse } from "next/server";
import { OrderType } from "@prisma/client";
import prisma from "@/lib/prisma";
import { AuthorizationError, ORDER_READ_ROLES, ORDER_WRITE_ROLES, requireActor } from "@/lib/commerce/authz";
import { createRestaurantOrder } from "@/lib/commerce/orders";
import { getPaginationParams, paginatedResponse } from "@/lib/api-helpers";

/** Real Order columns only: derived/UI-only values must never reach Prisma. */
const ORDER_SORT_FIELDS = [
  "orderNumber",
  "status",
  "type",
  "total",
  "subtotal",
  "tax",
  "discount",
  "tip",
  "paymentStatus",
  "createdAt",
  "updatedAt",
] as const;

const ORDER_TYPES = Object.values(OrderType);

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
    const searchParams = request.nextUrl.searchParams;
    const status = searchParams.get("status") ?? undefined;

    const typeParam = searchParams.get("type");
    if (typeParam && !ORDER_TYPES.includes(typeParam as OrderType)) {
      return NextResponse.json(
        { error: `Invalid type. Allowed: ${ORDER_TYPES.join(", ")}` },
        { status: 400 },
      );
    }

    const sortByParam = searchParams.get("sortBy");
    if (sortByParam && !(ORDER_SORT_FIELDS as readonly string[]).includes(sortByParam)) {
      return NextResponse.json(
        { error: `Invalid sortBy. Allowed: ${ORDER_SORT_FIELDS.join(", ")}` },
        { status: 400 },
      );
    }
    const sortDirectionParam = searchParams.get("sortDirection");
    if (sortDirectionParam && sortDirectionParam !== "asc" && sortDirectionParam !== "desc") {
      return NextResponse.json({ error: "Invalid sortDirection. Allowed: asc, desc" }, { status: 400 });
    }
    const sortBy = sortByParam ?? "createdAt";
    const sortDirection = sortDirectionParam === "asc" ? "asc" : "desc";

    const where = {
      ...(status ? { status: status as never } : {}),
      ...(searchParams.get("scope") === "active"
        ? { status: { notIn: ["COMPLETED", "CANCELLED"] } as never }
        : searchParams.get("scope") === "completed"
          ? { status: { in: ["COMPLETED", "CANCELLED"] } as never }
          : {}),
      ...(typeParam ? { type: typeParam as OrderType } : {}),
      ...(actor.role === "CUSTOMER" ? { customer: { userId: actor.userId } } : {}),
    };
    const [orders, total] = await Promise.all([
      prisma.order.findMany({
        where,
        orderBy: { [sortBy]: sortDirection },
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
