import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { z } from "zod";
import prisma from "@/lib/prisma";
import { sha256 } from "@/lib/commerce/crypto";

const schema = z.object({ token: z.string().min(32), password: z.string().min(14).max(200) });

export async function POST(request: NextRequest) {
  try {
    const input = schema.parse(await request.json());
    const tokenHash = sha256(input.token);
    const reset = await prisma.passwordResetToken.findUnique({ where: { tokenHash } });
    if (!reset || reset.usedAt || reset.expiresAt <= new Date()) return NextResponse.json({ error: "Reset token is invalid or expired" }, { status: 400 });
    const password = await bcrypt.hash(input.password, 12);
    await prisma.$transaction([
      prisma.user.update({ where: { id: reset.userId }, data: { password, authVersion: { increment: 1 } } }),
      prisma.passwordResetToken.update({ where: { id: reset.id }, data: { usedAt: new Date() } }),
      prisma.passwordResetToken.updateMany({ where: { userId: reset.userId, id: { not: reset.id }, usedAt: null }, data: { usedAt: new Date() } }),
    ]);
    return NextResponse.json({ reset: true });
  } catch (error) {
    return NextResponse.json({ error: (error as { name?: string }).name === "ZodError" ? "Invalid reset request" : "Reset failed" }, { status: 400 });
  }
}
