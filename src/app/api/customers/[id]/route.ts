import { withAccess, MANAGEMENT, OPERATIONS } from "@/lib/commerce/access";
import { NextRequest, NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import prisma from "@/lib/prisma";

const EDITABLE_FIELDS = [
  "firstName",
  "lastName",
  "email",
  "phone",
  "address",
  "dietaryPrefs",
  "allergens",
  "notes",
  "vipStatus",
] as const;

const DATE_FIELDS = ["birthday", "anniversary"] as const;

async function handleGET(request: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
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

async function handlePUT(request: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  try {
    const body = await request.json().catch(() => null);
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return NextResponse.json({ error: "A JSON object body is required" }, { status: 400 });
    }
    const payload = body as Record<string, unknown>;
    const data: Record<string, unknown> = {};

    // Only write keys the caller actually sent. Editing a phone number must not
    // null out the address or birthday the payload happens to omit.
    for (const field of EDITABLE_FIELDS) {
      if (field in payload) data[field] = payload[field];
    }
    for (const field of DATE_FIELDS) {
      if (!(field in payload)) continue;
      const value = payload[field];
      if (!value) {
        // Explicit null (or an empty input) clears the date.
        data[field] = null;
      } else {
        const date = typeof value === "string" || typeof value === "number" ? new Date(value) : new Date(NaN);
        if (Number.isNaN(date.getTime())) {
          return NextResponse.json({ error: `${field} must be a valid date or null` }, { status: 422 });
        }
        data[field] = date;
      }
    }

    const customer = await prisma.customer.update({
      where: { id: params.id },
      data: data as Prisma.CustomerUpdateInput,
      include: { loyaltyPoints: true },
    });
    return NextResponse.json(customer);
  } catch (error) {
    console.error("Error updating customer:", error);
    return NextResponse.json({ error: "Failed to update customer" }, { status: 500 });
  }
}

async function handleDELETE(request: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
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

export const GET = withAccess(OPERATIONS, handleGET);

export const PUT = withAccess(MANAGEMENT, handlePUT);

export const DELETE = withAccess(MANAGEMENT, handleDELETE);
