import { recordMutation, recordMutationFailure } from "@/lib/record-mutation";
import { withAccess, MANAGEMENT } from "@/lib/commerce/access";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

async function handlePUT(request: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  try {
    const body = await request.json();

    const schedule = await recordMutation(request, tx => tx.schedule.update({
      where: { id: params.id },
      data: {
        ...body,
        date: body.date ? new Date(body.date) : undefined,
        startTime: body.startTime ? new Date(body.startTime) : undefined,
        endTime: body.endTime ? new Date(body.endTime) : undefined,
      },
      include: {
        staff: {
          include: { user: true },
        },
      },
    }));

    return NextResponse.json(schedule);
  } catch (error) {
    const cancelled = recordMutationFailure(error); if (cancelled) return cancelled;
    console.error("Error updating schedule:", error);
    return NextResponse.json(
      { error: "Failed to update schedule" },
      { status: 500 }
    );
  }
}

async function handleDELETE(request: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  try {
    await recordMutation(request, tx => tx.schedule.delete({
      where: { id: params.id },
    }));

    return NextResponse.json({ success: true });
  } catch (error) {
    const cancelled = recordMutationFailure(error); if (cancelled) return cancelled;
    console.error("Error deleting schedule:", error);
    return NextResponse.json(
      { error: "Failed to delete schedule" },
      { status: 500 }
    );
  }
}

export const PUT = withAccess(MANAGEMENT, handlePUT);

export const DELETE = withAccess(MANAGEMENT, handleDELETE);
