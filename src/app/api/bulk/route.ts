import { NextResponse } from "next/server";

export async function DELETE() {
  return NextResponse.json({ error: "Unscoped bulk deletion is disabled" }, { status: 405 });
}

export async function PATCH() {
  return NextResponse.json({ error: "Unscoped bulk mutation is disabled" }, { status: 405 });
}
