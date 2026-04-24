import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { handleApiError } from "@/lib/api-helpers";

// Bulk delete
export async function DELETE(request: NextRequest) {
  try {
    const body = await request.json();
    const { model, ids } = body;

    if (!model || !ids || !Array.isArray(ids) || ids.length === 0) {
      return NextResponse.json({ error: "Model name and array of IDs are required" }, { status: 400 });
    }

    const allowedModels = ["order", "customer", "menuItem", "staff", "reservation", "ingredient", "feedback", "promotion", "notification", "wasteRecord", "vendor"];

    if (!allowedModels.includes(model)) {
      return NextResponse.json({ error: `Model '${model}' is not allowed for bulk operations` }, { status: 400 });
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const prismaModel = (prisma as any)[model];
    const result = await prismaModel.deleteMany({
      where: { id: { in: ids } },
    });

    return NextResponse.json({ deleted: result.count, message: `${result.count} records deleted` });
  } catch (error) {
    return handleApiError(error, "Bulk Delete");
  }
}

// Bulk update
export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json();
    const { model, ids, data } = body;

    if (!model || !ids || !Array.isArray(ids) || ids.length === 0 || !data) {
      return NextResponse.json({ error: "Model name, array of IDs, and update data are required" }, { status: 400 });
    }

    const allowedModels = ["order", "customer", "menuItem", "staff", "reservation", "ingredient", "feedback", "promotion", "notification"];

    if (!allowedModels.includes(model)) {
      return NextResponse.json({ error: `Model '${model}' is not allowed for bulk operations` }, { status: 400 });
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const prismaModel = (prisma as any)[model];
    const result = await prismaModel.updateMany({
      where: { id: { in: ids } },
      data,
    });

    return NextResponse.json({ updated: result.count, message: `${result.count} records updated` });
  } catch (error) {
    return handleApiError(error, "Bulk Update");
  }
}
