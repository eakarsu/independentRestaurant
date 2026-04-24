import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { email } = body;

    if (!email) {
      return NextResponse.json({ error: "Email is required" }, { status: 400 });
    }

    const user = await prisma.user.findUnique({ where: { email } });

    if (!user) {
      return NextResponse.json({ message: "If an account with that email exists, a password reset link has been sent" });
    }

    const resetToken = Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
    console.log(`Password reset token for ${email}: ${resetToken}`);

    return NextResponse.json({ message: "If an account with that email exists, a password reset link has been sent" });
  } catch (error) {
    console.error("Error processing password reset:", error);
    return NextResponse.json({ error: "Failed to process password reset request" }, { status: 500 });
  }
}
