import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { z } from "zod";
import prisma from "@/lib/prisma";
import { AuthorizationError, ORDER_READ_ROLES, requireActor } from "@/lib/commerce/authz";

const schema = z.object({ currentPassword: z.string().min(1), newPassword: z.string().min(14).max(200) });

export async function POST(request: NextRequest) {
  try {
    const actor = await requireActor(ORDER_READ_ROLES);
    const input = schema.parse(await request.json());
    const user = await prisma.user.findUniqueOrThrow({ where: { id: actor.userId } });
    if (!await bcrypt.compare(input.currentPassword, user.password)) return NextResponse.json({ error: "Current password is incorrect" }, { status: 401 });
    await prisma.user.update({ where: { id: user.id }, data: { password: await bcrypt.hash(input.newPassword, 12), authVersion: { increment: 1 } } });
    return NextResponse.json({ changed: true, signInRequired: true });
  } catch (error) {
    const status = error instanceof AuthorizationError ? error.status : (error as { name?: string }).name === "ZodError" ? 400 : 500;
    return NextResponse.json({ error: error instanceof Error ? error.message : "Password change failed" }, { status });
  }
}
