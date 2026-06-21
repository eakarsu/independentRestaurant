import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const integration = await prisma.integration.findUnique({
      where: { id: params.id },
    });

    if (!integration) {
      return NextResponse.json(
        { error: "Integration not found" },
        { status: 404 }
      );
    }

    const logs = await prisma.integrationLog.findMany({
      where: { integrationId: params.id },
      orderBy: { createdAt: "desc" },
      take: 10,
    });

    return NextResponse.json({ ...integration, logs });
  } catch (error) {
    console.error("Error fetching integration:", error);
    return NextResponse.json(
      { error: "Failed to fetch integration" },
      { status: 500 }
    );
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const body = await request.json();
    const { isActive, config } = body;

    const existing = await prisma.integration.findUnique({
      where: { id: params.id },
    });

    if (!existing) {
      return NextResponse.json(
        { error: "Integration not found" },
        { status: 404 }
      );
    }

    const data: {
      isActive?: boolean;
      config?: object;
      lastSync?: Date | null;
    } = {};

    if (typeof isActive === "boolean") {
      data.isActive = isActive;
      // Connecting performs an initial sync; disconnecting clears it.
      data.lastSync = isActive ? new Date() : null;
    }

    if (config !== undefined) {
      // Merge so partial config updates don't drop the stored description, etc.
      data.config = {
        ...(typeof existing.config === "object" && existing.config !== null
          ? existing.config
          : {}),
        ...config,
      };
    }

    const integration = await prisma.integration.update({
      where: { id: params.id },
      data,
    });

    // Record an audit log entry for connect/disconnect actions.
    if (typeof isActive === "boolean") {
      await prisma.integrationLog.create({
        data: {
          integrationId: integration.id,
          action: isActive ? "connect" : "disconnect",
          status: "success",
          message: `${integration.name} ${isActive ? "connected" : "disconnected"}`,
        },
      });
    }

    return NextResponse.json(integration);
  } catch (error) {
    console.error("Error updating integration:", error);
    return NextResponse.json(
      { error: "Failed to update integration" },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    await prisma.integration.delete({
      where: { id: params.id },
    });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error deleting integration:", error);
    return NextResponse.json(
      { error: "Failed to delete integration" },
      { status: 500 }
    );
  }
}
