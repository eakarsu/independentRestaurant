import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";

export async function GET() {
  try {
    const vendors = await prisma.vendor.findMany({
      orderBy: { name: "asc" },
      include: { ingredients: true },
    });
    return NextResponse.json(vendors);
  } catch (error) {
    console.error("Error fetching vendors:", error);
    return NextResponse.json({ error: "Failed to fetch vendors" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const vendor = await prisma.vendor.create({
      data: {
        name: body.name,
        contactName: body.contactName,
        email: body.email,
        phone: body.phone,
        address: body.address,
        paymentTerms: body.paymentTerms,
        notes: body.notes,
        isActive: body.isActive ?? true,
      },
    });
    return NextResponse.json(vendor, { status: 201 });
  } catch (error) {
    console.error("Error creating vendor:", error);
    return NextResponse.json({ error: "Failed to create vendor" }, { status: 500 });
  }
}
