import { withAccess, MANAGEMENT } from "@/lib/commerce/access";
import { NextRequest, NextResponse } from "next/server";
import { Prisma, StaffStatus } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/prisma";

const BULK_MODELS = ["customer", "menuItem", "staff"] as const;
type BulkModel = (typeof BULK_MODELS)[number];

const idsSchema = z.array(z.string().trim().min(1)).min(1).max(100);
const deleteSchema = z.object({ model: z.enum(BULK_MODELS), ids: idsSchema });
const patchSchema = z.object({ model: z.enum(BULK_MODELS), ids: idsSchema, data: z.unknown() });
const patchDataSchemas = {
  customer: z.object({ vipStatus: z.boolean() }).strict(),
  menuItem: z.object({ is86d: z.boolean() }).strict(),
  staff: z.object({ status: z.nativeEnum(StaffStatus) }).strict(),
};

function readModel(body: unknown): BulkModel | null {
  const model = body && typeof body === "object" ? (body as { model?: unknown }).model : undefined;
  return typeof model === "string" && (BULK_MODELS as readonly string[]).includes(model)
    ? (model as BulkModel)
    : null;
}

function issues(error: z.ZodError): string {
  return error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`).join("; ");
}

function bulkError(error: unknown): NextResponse {
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    if (error.code === "P2003") {
      return NextResponse.json(
        { error: "Cannot delete or change records that are still referenced by other data" },
        { status: 409 },
      );
    }
    if (error.code === "P2002") {
      return NextResponse.json({ error: "A record with this value already exists" }, { status: 409 });
    }
  }
  console.error("Bulk operation failed:", error);
  return NextResponse.json({ error: "Failed to process bulk request" }, { status: 500 });
}

async function handleDELETE(request: NextRequest) {
  try {
    const body = await request.json().catch(() => null);
    const model = readModel(body);
    if (!model) {
      return NextResponse.json({ error: "model must be one of: customer, menuItem, staff" }, { status: 400 });
    }

    const parsed = deleteSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: issues(parsed.error) }, { status: 422 });
    }
    const { ids } = parsed.data;

    if (model === "staff") {
      // Removing a staff member also removes the login account it belongs to.
      const deleted = await prisma.$transaction(async (tx) => {
        const rows = await tx.staff.findMany({
          where: { id: { in: ids } },
          select: { id: true, userId: true },
        });
        const result = await tx.staff.deleteMany({ where: { id: { in: rows.map((row) => row.id) } } });
        await tx.user.deleteMany({ where: { id: { in: rows.map((row) => row.userId) } } });
        return result.count;
      });
      return NextResponse.json({ deleted });
    }

    const result =
      model === "customer"
        ? await prisma.customer.deleteMany({ where: { id: { in: ids } } })
        : await prisma.menuItem.deleteMany({ where: { id: { in: ids } } });
    return NextResponse.json({ deleted: result.count });
  } catch (error) {
    return bulkError(error);
  }
}

async function handlePATCH(request: NextRequest) {
  try {
    const body = await request.json().catch(() => null);
    const model = readModel(body);
    if (!model) {
      return NextResponse.json({ error: "model must be one of: customer, menuItem, staff" }, { status: 400 });
    }

    const parsed = patchSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: issues(parsed.error) }, { status: 422 });
    }
    const { ids } = parsed.data;
    const rawData = (body as { data?: unknown }).data;

    if (model === "customer") {
      const data = patchDataSchemas.customer.safeParse(rawData);
      if (!data.success) return NextResponse.json({ error: issues(data.error) }, { status: 422 });
      const result = await prisma.customer.updateMany({ where: { id: { in: ids } }, data: data.data });
      return NextResponse.json({ updated: result.count });
    }
    if (model === "menuItem") {
      const data = patchDataSchemas.menuItem.safeParse(rawData);
      if (!data.success) return NextResponse.json({ error: issues(data.error) }, { status: 422 });
      const result = await prisma.menuItem.updateMany({ where: { id: { in: ids } }, data: data.data });
      return NextResponse.json({ updated: result.count });
    }
    const data = patchDataSchemas.staff.safeParse(rawData);
    if (!data.success) return NextResponse.json({ error: issues(data.error) }, { status: 422 });
    const result = await prisma.staff.updateMany({ where: { id: { in: ids } }, data: data.data });
    return NextResponse.json({ updated: result.count });
  } catch (error) {
    return bulkError(error);
  }
}

export const DELETE = withAccess(MANAGEMENT, handleDELETE);

export const PATCH = withAccess(MANAGEMENT, handlePATCH);
