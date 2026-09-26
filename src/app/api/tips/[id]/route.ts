import { withAccess, MANAGEMENT } from "@/lib/commerce/access";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

/**
 * Edit or remove a single tip record.
 *
 * The collection route only supported GET and POST, so the tips table had no
 * per-row actions. Validation matches the create path: a tip must stay a
 * positive finite amount, keep a known source, and have a parseable date.
 */
const ALLOWED_SOURCES = ["cash", "card", "pooled"];

type Params = { params: Promise<{ id: string }> };

async function handlePATCH(request: NextRequest, { params }: Params) {
  try {
    const { id } = await params;
    const body = await request.json();

    const existing = await prisma.tipDistribution.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: "Tip record not found" }, { status: 404 });
    }

    const data: {
      staffId?: string;
      amount?: number;
      source?: string;
      date?: Date;
    } = {};

    if (body.staffId !== undefined) {
      if (typeof body.staffId !== "string" || !body.staffId.trim()) {
        return NextResponse.json({ error: "staffId must be a non-empty string" }, { status: 400 });
      }
      const staff = await prisma.staff.findUnique({ where: { id: body.staffId } });
      if (!staff) return NextResponse.json({ error: "Staff member not found" }, { status: 404 });
      data.staffId = body.staffId;
    }

    if (body.amount !== undefined) {
      const amount = Number(body.amount);
      if (!Number.isFinite(amount) || amount <= 0) {
        return NextResponse.json({ error: "amount must be a positive number" }, { status: 400 });
      }
      data.amount = amount;
    }

    if (body.source !== undefined) {
      if (!ALLOWED_SOURCES.includes(body.source)) {
        return NextResponse.json(
          { error: `source must be one of: ${ALLOWED_SOURCES.join(", ")}` },
          { status: 400 },
        );
      }
      data.source = body.source;
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

    const updated = await prisma.tipDistribution.update({
      where: { id },
      data,
      include: { staff: true },
    });
    return NextResponse.json(updated);
  } catch (error) {
    console.error("Error updating tip:", error);
    return NextResponse.json({ error: "Failed to update tip" }, { status: 500 });
  }
}

async function handleDELETE(_request: NextRequest, { params }: Params) {
  try {
    const { id } = await params;
    const existing = await prisma.tipDistribution.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: "Tip record not found" }, { status: 404 });
    }
    await prisma.tipDistribution.delete({ where: { id } });
    return NextResponse.json({ deleted: true, id });
  } catch (error) {
    console.error("Error deleting tip:", error);
    return NextResponse.json({ error: "Failed to delete tip" }, { status: 500 });
  }
}

export const PATCH = withAccess(MANAGEMENT, handlePATCH);
export const DELETE = withAccess(MANAGEMENT, handleDELETE);
