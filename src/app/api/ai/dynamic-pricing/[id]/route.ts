import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";

/** Manager approve / reject / apply for a dynamic price suggestion. */
export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const role = (session.user as any).role;
  if (role && role !== "ADMIN" && role !== "MANAGER") {
    return NextResponse.json({ error: "Manager access required" }, { status: 403 });
  }
  const userId = (session.user as any).id || session.user.email;

  const body = await request.json();
  const action = body.action as "approve" | "reject" | "apply";
  if (!["approve", "reject", "apply"].includes(action)) {
    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  }

  const sugg = await prisma.dynamicPriceSuggestion.findUnique({ where: { id: params.id } });
  if (!sugg) return NextResponse.json({ error: "Not found" }, { status: 404 });

  if (action === "reject") {
    const updated = await prisma.dynamicPriceSuggestion.update({
      where: { id: sugg.id },
      data: { status: "rejected", decidedAt: new Date(), decidedById: userId },
    });
    return NextResponse.json(updated);
  }

  if (action === "approve") {
    const updated = await prisma.dynamicPriceSuggestion.update({
      where: { id: sugg.id },
      data: { status: "approved", decidedAt: new Date(), decidedById: userId },
    });
    return NextResponse.json(updated);
  }

  // apply — write the new price onto the menu item
  await prisma.menuItem.update({
    where: { id: sugg.menuItemId },
    data: { price: sugg.suggestedPrice },
  });
  const updated = await prisma.dynamicPriceSuggestion.update({
    where: { id: sugg.id },
    data: {
      status: "applied",
      appliedAt: new Date(),
      decidedAt: sugg.decidedAt ?? new Date(),
      decidedById: sugg.decidedById ?? userId,
    },
  });
  return NextResponse.json(updated);
}

export async function DELETE(_request: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  await prisma.dynamicPriceSuggestion.delete({ where: { id: params.id } });
  return NextResponse.json({ ok: true });
}
