import { withAccess, MANAGEMENT } from "@/lib/commerce/access";
import { NextRequest, NextResponse } from "next/server";
import { Prisma, StaffStatus } from "@prisma/client";
import { z } from "zod";
import prisma from "@/lib/prisma";

const staffUpdateSchema = z.object({
  firstName: z.string().trim().min(1).max(100).optional(),
  lastName: z.string().trim().min(1).max(100).optional(),
  phone: z.string().max(40).optional(),
  position: z.string().trim().min(1).max(100).optional(),
  hourlyRate: z.number().min(0).max(10000).optional(),
  status: z.nativeEnum(StaffStatus).optional(),
  email: z.string().email().toLowerCase().optional(),
  role: z.enum(["MANAGER", "OPERATOR", "STAFF", "HOST", "CHEF"]).optional(),
});

async function handleGET(request: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  try {
    const staff = await prisma.staff.findUnique({
      where: { id: params.id },
      include: {
        user: { select: { email: true, role: true } },
        schedules: { orderBy: { date: "desc" }, take: 10 },
        timeClock: { orderBy: { clockIn: "desc" }, take: 10 },
        tips: { orderBy: { date: "desc" }, take: 10 },
        performance: { orderBy: { date: "desc" }, take: 10 },
        training: true,
      },
    });
    if (!staff) {
      return NextResponse.json({ error: "Staff not found" }, { status: 404 });
    }
    return NextResponse.json(staff);
  } catch (error) {
    console.error("Error fetching staff:", error);
    return NextResponse.json({ error: "Failed to fetch staff" }, { status: 500 });
  }
}

async function handlePUT(request: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  try {
    const input = staffUpdateSchema.safeParse(await request.json().catch(() => null));
    if (!input.success) {
      return NextResponse.json(
        { error: input.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`).join("; ") },
        { status: 422 },
      );
    }

    const { email, role, ...staffFields } = input.data;
    const staffData: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(staffFields)) {
      if (value !== undefined) staffData[key] = value;
    }

    const existing = await prisma.staff.findUnique({
      where: { id: params.id },
      select: { userId: true },
    });
    if (!existing) {
      return NextResponse.json({ error: "Staff not found" }, { status: 404 });
    }

    const staff = await prisma.$transaction(async (tx) => {
      if (Object.keys(staffData).length > 0) {
        await tx.staff.update({ where: { id: params.id }, data: staffData as Prisma.StaffUpdateInput });
      }
      if (email !== undefined || role !== undefined) {
        await tx.user.update({
          where: { id: existing.userId },
          data: {
            ...(email !== undefined ? { email } : {}),
            ...(role !== undefined ? { role } : {}),
          },
        });
      }
      return tx.staff.findUniqueOrThrow({
        where: { id: params.id },
        include: { user: { select: { email: true, role: true } } },
      });
    });
    return NextResponse.json(staff);
  } catch (error) {
    console.error("Error updating staff:", error);
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (error.code === "P2002") {
        return NextResponse.json({ error: "A user with this email already exists" }, { status: 409 });
      }
      if (error.code === "P2025") {
        return NextResponse.json({ error: "Staff not found" }, { status: 404 });
      }
    }
    return NextResponse.json({ error: "Failed to update staff" }, { status: 500 });
  }
}

async function handleDELETE(request: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  try {
    const staff = await prisma.staff.findUnique({
      where: { id: params.id },
      select: { userId: true },
    });

    if (staff) {
      await prisma.$transaction([
        prisma.staff.delete({ where: { id: params.id } }),
        prisma.user.delete({ where: { id: staff.userId } }),
      ]);
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error deleting staff:", error);
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (error.code === "P2003") {
        return NextResponse.json(
          { error: "Cannot delete this staff member because other records reference them" },
          { status: 409 },
        );
      }
      if (error.code === "P2025") {
        return NextResponse.json({ error: "Staff not found" }, { status: 404 });
      }
    }
    return NextResponse.json({ error: "Failed to delete staff" }, { status: 500 });
  }
}

export const GET = withAccess(MANAGEMENT, handleGET);

export const PUT = withAccess(["ADMIN", "MERCHANT"], handlePUT);

export const DELETE = withAccess(["ADMIN", "MERCHANT"], handleDELETE);
