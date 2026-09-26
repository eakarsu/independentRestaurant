import { withAccess, MANAGEMENT } from "@/lib/commerce/access";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

/**
 * Edit or remove a single performance review.
 *
 * The collection route only supported GET and POST, so the "Recent Performance
 * Reviews" table had no per-row actions. Validation mirrors what the create
 * path should enforce: a known staff member, a non-empty metric, a finite
 * score, and a parseable date.
 */
type Params = { params: Promise<{ id: string }> };

async function handlePATCH(request: NextRequest, { params }: Params) {
  try {
    const { id } = await params;
    const body = await request.json();

    const existing = await prisma.performanceRecord.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: "Performance record not found" }, { status: 404 });
    }

    const data: { staffId?: string; metric?: string; value?: number; notes?: string | null; date?: Date } = {};

    if (body.staffId !== undefined) {
      if (typeof body.staffId !== "string" || !body.staffId.trim()) {
        return NextResponse.json({ error: "staffId must be a non-empty string" }, { status: 400 });
      }
      const staff = await prisma.staff.findUnique({ where: { id: body.staffId } });
      if (!staff) return NextResponse.json({ error: "Staff member not found" }, { status: 404 });
      data.staffId = body.staffId;
    }
    if (body.metric !== undefined) {
      if (typeof body.metric !== "string" || !body.metric.trim()) {
        return NextResponse.json({ error: "metric must be a non-empty string" }, { status: 400 });
      }
      data.metric = body.metric.trim();
    }
    if (body.value !== undefined) {
      const value = Number(body.value);
      if (!Number.isFinite(value)) {
        return NextResponse.json({ error: "value must be a finite number" }, { status: 400 });
      }
      data.value = value;
    }
    if (body.notes !== undefined) {
      data.notes = body.notes === null ? null : String(body.notes).slice(0, 2000);
    }
    if (body.date !== undefined) {
      const parsed = new Date(body.date);
      if (Number.isNaN(parsed.getTime())) {
        return NextResponse.json({ error: "date is invalid" }, { status: 400 });
      }
      data.date = parsed;
    }

    if (Object.keys(data).length === 0) {
      return NextResponse.json({ error: "No editable fields supplied" }, { status: 400 });
    }

    const updated = await prisma.performanceRecord.update({
      where: { id },
      data,
      include: { staff: { select: { firstName: true, lastName: true, position: true } } },
    });
    return NextResponse.json(updated);
  } catch (error) {
    console.error("Error updating performance record:", error);
    return NextResponse.json({ error: "Failed to update performance record" }, { status: 500 });
  }
}

async function handleDELETE(_request: NextRequest, { params }: Params) {
  try {
    const { id } = await params;
    const existing = await prisma.performanceRecord.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: "Performance record not found" }, { status: 404 });
    }
    await prisma.performanceRecord.delete({ where: { id } });
    return NextResponse.json({ deleted: true, id });
  } catch (error) {
    console.error("Error deleting performance record:", error);
    return NextResponse.json({ error: "Failed to delete performance record" }, { status: 500 });
  }
}

export const PATCH = withAccess(MANAGEMENT, handlePATCH);
export const DELETE = withAccess(MANAGEMENT, handleDELETE);
