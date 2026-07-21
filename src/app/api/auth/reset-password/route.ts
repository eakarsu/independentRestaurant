import { randomBytes } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import prisma from "@/lib/prisma";
import { sha256 } from "@/lib/commerce/crypto";
import { sendPasswordResetEmail } from "@/lib/email";
import { authLimiter } from "@/lib/rate-limit";
import { getClientIp } from "@/lib/api-helpers";

const schema = z.object({ email: z.string().email().transform((value) => value.toLowerCase()) });

export async function POST(request: NextRequest) {
  if (!authLimiter(getClientIp(request)).success) return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  const generic = { message: "If the account exists, a reset message has been sent" };
  try {
    const input = schema.parse(await request.json());
    const user = await prisma.user.findUnique({ where: { email: input.email } });
    if (!user?.isActive) return NextResponse.json(generic);
    const token = randomBytes(32).toString("base64url");
    await prisma.passwordResetToken.create({ data: { userId: user.id, tokenHash: sha256(token), expiresAt: new Date(Date.now() + 30 * 60_000) } });
    await sendPasswordResetEmail(user.email, token);
    return NextResponse.json(generic);
  } catch {
    return NextResponse.json(generic);
  }
}
