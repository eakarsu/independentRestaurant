import { recordMutation, recordMutationFailure } from "@/lib/record-mutation";
import { withAccess, MANAGEMENT } from "@/lib/commerce/access";
import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";

async function handlePUT(request: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  try {
    const body = await request.json();
    const vendor = await recordMutation(request, tx => tx.vendor.update({
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
    }));
    return NextResponse.json(vendor);
  } catch (error) {
    const cancelled = recordMutationFailure(error); if (cancelled) return cancelled;
    console.error("Error updating vendor:", error);
    return NextResponse.json({ error: "Failed to update vendor" }, { status: 500 });
  }
}

async function handleDELETE(request: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  try {
    await recordMutation(request, tx => tx.vendor.delete({
      where: { id: params.id },
    }));
    return NextResponse.json({ success: true });
  } catch (error) {
    const cancelled = recordMutationFailure(error); if (cancelled) return cancelled;
    console.error("Error deleting vendor:", error);
    return NextResponse.json({ error: "Failed to delete vendor" }, { status: 500 });
  }
}

export const PUT = withAccess(MANAGEMENT, handlePUT);

export const DELETE = withAccess(MANAGEMENT, handleDELETE);
