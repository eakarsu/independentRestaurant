import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const customer = await prisma.customer.findUnique({
      where: { id: params.id },
      include: {
        loyaltyPoints: {
          include: {
            transactions: { orderBy: { createdAt: "desc" }, take: 10 },
          },
        },
        orders: { orderBy: { createdAt: "desc" }, take: 10 },
        reservations: { orderBy: { date: "desc" }, take: 10 },
        feedback: { orderBy: { createdAt: "desc" }, take: 10 },
      },
    });
    if (!customer) {
      return NextResponse.json({ error: "Customer not found" }, { status: 404 });
    }
    return NextResponse.json(customer);
  } catch (error) {
    console.error("Error fetching customer:", error);
    return NextResponse.json({ error: "Failed to fetch customer" }, { status: 500 });
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const body = await request.json();
    const customer = await prisma.customer.update({
      where: { id: params.id },
      data: {
        firstName: body.firstName,
        lastName: body.lastName,
        email: body.email,
        phone: body.phone,
        address: body.address,
        birthday: body.birthday ? new Date(body.birthday) : null,
        anniversary: body.anniversary ? new Date(body.anniversary) : null,
        dietaryPrefs: body.dietaryPrefs,
        allergens: body.allergens,
        notes: body.notes,
        vipStatus: body.vipStatus,
      },
      include: { loyaltyPoints: true },
    });
    return NextResponse.json(customer);
  } catch (error) {
    console.error("Error updating customer:", error);
    return NextResponse.json({ error: "Failed to update customer" }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    await prisma.customer.delete({
      where: { id: params.id },
    });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error deleting customer:", error);
    return NextResponse.json({ error: "Failed to delete customer" }, { status: 500 });
  }
}
