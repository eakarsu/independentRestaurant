import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import prisma from "@/lib/prisma";
import { AuthorizationError, REFUND_ROLES, requireActor } from "@/lib/commerce/authz";

const schema = z.object({ isActive: z.boolean() });

export async function PATCH(request: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  try {
    const actor = await requireActor(REFUND_ROLES);
    const body = schema.parse(await request.json());
    const integration = await prisma.$transaction(async (tx) => {
      const updated = await tx.integration.update({ where: { id: params.id }, data: { isActive: body.isActive } });
      await tx.integrationLog.create({
        data: { integrationId: updated.id, action: body.isActive ? "enable" : "disable", status: "success", message: `${actor.userId} ${body.isActive ? "enabled" : "disabled"} ${updated.name}` },
      });
      return updated;
    });
    return NextResponse.json({ ...integration, config: undefined });
  } catch (error) {
    const status = error instanceof AuthorizationError ? error.status : (error as { name?: string }).name === "ZodError" ? 400 : 500;
    return NextResponse.json({ error: error instanceof Error ? error.message : "Integration update failed" }, { status });
  }
}

export async function DELETE() {
  return NextResponse.json({ error: "Integration evidence is retained; disable it instead" }, { status: 405 });
}
