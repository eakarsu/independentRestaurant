import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { z } from "zod";
import prisma from "@/lib/prisma";
import { AuthorizationError, requireActor } from "@/lib/commerce/authz";

const schema = z.object({
  email: z.string().email().transform((value) => value.toLowerCase()),
  name: z.string().trim().min(1).max(120),
  password: z.string().min(14).max(200),
  role: z.enum(["MERCHANT", "MANAGER", "OPERATOR", "STAFF", "HOST", "CHEF", "CUSTOMER"]),
});

export async function POST(request: NextRequest) {
  try {
    await requireActor(["ADMIN", "MERCHANT"]);
    const input = schema.parse(await request.json());
    const user = await prisma.user.create({
      data: { ...input, password: await bcrypt.hash(input.password, 12) },
      select: { id: true, email: true, name: true, role: true, isActive: true, createdAt: true },
    });
    return NextResponse.json(user, { status: 201 });
  } catch (error) {
    const status = error instanceof AuthorizationError ? error.status : (error as { name?: string }).name === "ZodError" ? 400 : 409;
    return NextResponse.json({ error: error instanceof Error ? error.message : "Account provisioning failed" }, { status });
  }
}
