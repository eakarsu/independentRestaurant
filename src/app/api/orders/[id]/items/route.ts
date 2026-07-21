import { NextResponse } from "next/server";

export async function POST() {
  return NextResponse.json(
    { error: "Items are immutable after the inventory reservation; cancel and create a new idempotent order" },
    { status: 405 },
  );
}
