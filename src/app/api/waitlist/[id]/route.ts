import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";

export async function PUT(request: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  try {
    const body = await request.json();
    const waitlistEntry = await prisma.waitlist.update({
      where: { id: params.id },
      data: {
        customerName: body.customerName,
        customerPhone: body.customerPhone,
        partySize: body.partySize,
        estimatedWait: body.estimatedWait,
        quotedTime: body.quotedTime ? new Date(body.quotedTime) : null,
        notes: body.notes,
        status: body.status,
      },
    });
    return NextResponse.json(waitlistEntry);
  } catch (error) {
    console.error("Error updating waitlist entry:", error);
    return NextResponse.json({ error: "Failed to update waitlist entry" }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  try {
    await prisma.waitlist.delete({
      where: { id: params.id },
    });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error deleting waitlist entry:", error);
    return NextResponse.json({ error: "Failed to delete waitlist entry" }, { status: 500 });
  }
}
