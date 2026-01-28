import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";

export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const body = await request.json();
    const vendor = await prisma.vendor.update({
      where: { id: params.id },
      data: {
        name: body.name,
        contactName: body.contactName,
        email: body.email,
        phone: body.phone,
        address: body.address,
        paymentTerms: body.paymentTerms,
        notes: body.notes,
        isActive: body.isActive,
      },
    });
    return NextResponse.json(vendor);
  } catch (error) {
    console.error("Error updating vendor:", error);
    return NextResponse.json({ error: "Failed to update vendor" }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    await prisma.vendor.delete({
      where: { id: params.id },
    });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error deleting vendor:", error);
    return NextResponse.json({ error: "Failed to delete vendor" }, { status: 500 });
  }
}
