import { withAccess, MANAGEMENT } from "@/lib/commerce/access";
import { NextResponse } from "next/server";

async function handleDELETE() {
  return NextResponse.json({ error: "Unscoped bulk deletion is disabled" }, { status: 405 });
}

async function handlePATCH() {
  return NextResponse.json({ error: "Unscoped bulk mutation is disabled" }, { status: 405 });
}

export const DELETE = withAccess(MANAGEMENT, handleDELETE);

export const PATCH = withAccess(MANAGEMENT, handlePATCH);
